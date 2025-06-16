from fastapi import FastAPI, Query, Depends, HTTPException, status, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from azure.identity import DefaultAzureCredential
from azure.mgmt.resource import SubscriptionClient, ResourceManagementClient
from azure.mgmt.costmanagement import CostManagementClient
from azure.mgmt.costmanagement.models import QueryDefinition, QueryTimePeriod
from datetime import datetime
import logging
import os
from jose import jwt
import requests
from tenacity import retry, wait_exponential, stop_after_attempt
from azure.core.exceptions import HttpResponseError

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "https://blue-sea-045e3760f.6.azurestaticapps.net")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Entra ID (Azure AD) config - replace with your values or set as env vars
TENANT_ID = "f20f9c37-1548-43e5-8b23-8981ea1167ba"
CLIENT_ID = "e4a8b327-2ed5-4f00-b0ba-b5b9e95ffd3e"
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
JWKS_URL = f"{AUTHORITY}/discovery/v2.0/keys"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"

http_bearer = HTTPBearer()

def get_jwks():
    resp = requests.get(JWKS_URL)
    resp.raise_for_status()
    return resp.json()

JWKS = get_jwks()

def verify_jwt(token: str):
    try:
        unverified_header = jwt.get_unverified_header(token)
        key = next(
            (k for k in JWKS["keys"] if k["kid"] == unverified_header["kid"]),
            None
        )
        if not key:
            raise HTTPException(status_code=401, detail="Invalid token header.")
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=ISSUER
        )
        return payload
    except Exception as e:
        print("JWT validation error:", e)  # Add this line for debugging
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}"
        )
def require_auth(credentials: HTTPAuthorizationCredentials = Security(http_bearer)):
    return verify_jwt(credentials.credentials)

# Authenticate using DefaultAzureCredential (supports CLI, Managed Identity, etc.)
credential = DefaultAzureCredential()

def get_subscription_client():
    return SubscriptionClient(credential)

def get_resource_client(subscription_id):
    return ResourceManagementClient(credential, subscription_id)

def get_cost_client():
    return CostManagementClient(credential)

# Retry logic for Azure Cost Management API (handles 429 errors)
@retry(wait=wait_exponential(multiplier=2, min=2, max=10), stop=stop_after_attempt(3), reraise=True)
def query_cost_management(cost_client, scope, parameters):
    return cost_client.query.usage(scope=scope, parameters=parameters)

@app.get("/api/subscriptions")
def get_subscriptions(user=Depends(require_auth)):
    subs = get_subscription_client().subscriptions.list()
    return [{"id": s.subscription_id, "name": s.display_name} for s in subs]

@app.get("/api/resource-groups")
def get_resource_groups(subscription_id: str, user=Depends(require_auth)):
    client = get_resource_client(subscription_id)
    rgs = client.resource_groups.list()
    return [rg.name for rg in rgs]

@app.get("/api/costs")
def get_costs(subscription_id: str, from_date: str, to_date: str, resource_group: str = None, user=Depends(require_auth)):
    cost_client = get_cost_client()
    scope = f"/subscriptions/{subscription_id}"
    if resource_group:
        scope += f"/resourceGroups/{resource_group}"

    try:
        result = query_cost_management(
            cost_client,
            scope,
            QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(
                    from_property=datetime.strptime(from_date, "%Y-%m-%d"),
                    to=datetime.strptime(to_date, "%Y-%m-%d")
                ),
                dataset={
                    "granularity": "None",
                    "aggregation": {
                        "PreTaxCost": {
                            "name": "PreTaxCost",
                            "function": "Sum"
                        }
                    },
                    "grouping": [{
                        "type": "Dimension",
                        "name": "ResourceGroupName"
                    }]
                }
            )
        )
        columns = [col.name for col in result.columns]
        return [dict(zip(columns, row)) for row in result.rows]
    except HttpResponseError as e:
        if e.status_code == 429:
            return JSONResponse(status_code=429, content={"error": "Azure API rate limit exceeded. Please try again later."})
        raise
    except Exception as e:
        logging.exception("Error fetching cost data:")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/resources")
def get_resources(subscription: str, rg: str, from_date: str, to_date: str, user=Depends(require_auth)):
    rg = rg.strip()
    cost_client = get_cost_client()
    try:
        result = cost_client.query.usage(
            scope=f"/subscriptions/{subscription}/resourceGroups/{rg}",
            parameters=QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(
                    from_property=datetime.strptime(from_date, "%Y-%m-%d"),
                    to=datetime.strptime(to_date, "%Y-%m-%d"),
                ),
                dataset={
                    "granularity": "None",
                    "aggregation": {"PreTaxCost": {"name": "PreTaxCost", "function": "Sum"}},
                    "grouping": [{"type": "Dimension", "name": "ResourceId"}],
                }
            )
        )
        columns = [col.name for col in result.columns]
        return [dict(zip(columns, row)) for row in result.rows]
    except HttpResponseError as e:
        if e.status_code == 429:
            return JSONResponse(status_code=429, content={"error": "Azure API rate limit exceeded. Please try again later."})
        raise
    except Exception as e:
        logging.exception("Error fetching resource data:")
        return JSONResponse(status_code=500, content={"error": str(e)})