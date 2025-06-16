import React, { useState, useEffect } from "react";
import axios from "axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from "recharts";
import { PublicClientApplication } from "@azure/msal-browser";
import { useNavigate } from "react-router-dom";

const msalConfig = {
  auth: {
    clientId: "e4a8b327-2ed5-4f00-b0ba-b5b9e95ffd3e",
    authority: "https://login.microsoftonline.com/f20f9c37-1548-43e5-8b23-8981ea1167ba",
    redirectUri: window.location.origin,
  }
};
const msalInstance = new PublicClientApplication(msalConfig);
const loginRequest = {
  scopes: ["api://e4a8b327-2ed5-4f00-b0ba-b5b9e95ffd3e/access_as_user"]
};

function App() {
  const [account, setAccount] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [resourceGroups, setResourceGroups] = useState([]);
  const [selectedRG, setSelectedRG] = useState("");
  const [fromDate, setFromDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [toDate, setToDate] = useState(new Date());
  const [costData, setCostData] = useState([]);
  const navigate = useNavigate();

  // MSAL: Check for existing account on mount
  useEffect(() => {
    msalInstance.initialize().then(() => {
      const accounts = msalInstance.getAllAccounts();
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        acquireToken(accounts[0]);
      }
    });
    // eslint-disable-next-line
  }, []);

  // Acquire and store token
  const acquireToken = async (acc) => {
    try {
      const response = await msalInstance.acquireTokenSilent({ ...loginRequest, account: acc });
      localStorage.setItem("access_token", response.accessToken);
    } catch (error) {
      if (error.errorCode === "interaction_required") {
        try {
          const response = await msalInstance.acquireTokenPopup(loginRequest);
          localStorage.setItem("access_token", response.accessToken);
        } catch (popupError) {
          console.error("Token popup failed", popupError);
        }
      } else {
        console.error("Token silent failed", error);
      }
    }
  };

  // Login handler
  const handleLogin = async () => {
    try {
      await msalInstance.loginPopup(loginRequest);
      const accounts = msalInstance.getAllAccounts();
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        acquireToken(accounts[0]);
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    await msalInstance.logoutPopup();
    setAccount(null);
    localStorage.removeItem("access_token");
  };

  // Fetch subscriptions after login
  useEffect(() => {
    if (!account) return;
    const token = localStorage.getItem("access_token");
    axios.get("http://localhost:8000/api/subscriptions", {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => setSubscriptions(res.data))
      .catch(err => console.error("Error loading subscriptions", err));
  }, [account]);

  // Fetch resource groups when subscription changes
  useEffect(() => {
    if (!account || !selectedSubscription) return;
    const token = localStorage.getItem("access_token");
    axios.get("http://localhost:8000/api/resource-groups", {
      params: { subscription_id: selectedSubscription },
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => setResourceGroups(res.data))
      .catch(err => console.error("Error loading resource groups", err));
  }, [account, selectedSubscription]);

  // Fetch costs
  const fetchCosts = () => {
    if (!selectedSubscription) {
      alert("Please select a subscription.");
      return;
    }
    const fromStr = fromDate.toISOString().split("T")[0];
    const toStr = toDate.toISOString().split("T")[0];
    const token = localStorage.getItem("access_token");
    axios.get("http://localhost:8000/api/costs", {
      params: {
        subscription_id: selectedSubscription,
        from_date: fromStr,
        to_date: toStr,
        resource_group: selectedRG
      },
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    .then(res => setCostData(res.data))
    .catch(err => {
      console.error("Error fetching cost data", err);
      alert("Failed to fetch cost data.");
    });
  };

  // Handle bar click to navigate to resource details
  const handleBarClick = (event) => {
    if (event && event.activeLabel) {
      const fromStr = fromDate.toISOString().split("T")[0];
      const toStr = toDate.toISOString().split("T")[0];
      navigate(
        `/resources?subscription=${selectedSubscription}&rg=${event.activeLabel}&from=${fromStr}&to=${toStr}`
      );
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Azure Cost Dashboard</h1>
      <div style={{ marginBottom: 20 }}>
        {!account ? (
          <button onClick={handleLogin}>Login with Microsoft</button>
        ) : (
          <div>
            <span>Signed in as: {account.username}</span>
            <button onClick={handleLogout} style={{ marginLeft: 10 }}>Logout</button>
          </div>
        )}
      </div>
      {account && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <label>Subscription:</label>
            <select
              value={selectedSubscription}
              onChange={e => {
                setSelectedSubscription(e.target.value);
                setSelectedRG("");
                setCostData([]);
              }}
              style={{ marginLeft: 10 }}
            >
              <option value="">Select</option>
              {subscriptions.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
            <label style={{ marginLeft: 10 }}>Resource Group:</label>
            <select
              value={selectedRG}
              onChange={e => setSelectedRG(e.target.value)}
              style={{ marginLeft: 10 }}
            >
              <option value="">All</option>
              {resourceGroups.map(rg => (
                <option key={rg} value={rg}>{rg}</option>
              ))}
            </select>
            <label style={{ marginLeft: 10 }}>From:</label>
            <DatePicker selected={fromDate} onChange={setFromDate} />
            <label style={{ marginLeft: 10 }}>To:</label>
            <DatePicker selected={toDate} onChange={setToDate} />
            <button onClick={fetchCosts} style={{ marginLeft: 20 }}>
              Fetch Cost
            </button>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={costData} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ResourceGroupName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="PreTaxCost" fill="#0078d4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default App;