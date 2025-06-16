import React, { useEffect, useState } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";

function ResourceCost() {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const subscription = query.get("subscription");
  const rg = query.get("rg");
  const from = query.get("from");
  const to = query.get("to");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    axios.get("http://localhost:8000/api/resources", {
      params: { subscription, rg, from_date: from, to_date: to },
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setData(res.data))
    .catch(err => {
      console.error("Error loading resource costs:", err);
      setError("Failed to load resource-level cost data.");
    });
  }, [subscription, rg, from, to]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Resources in RG: {rg}</h2>
      <p>From: {from} → To: {to}</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>Resource Name</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
        {data.map((r, i) => (
          <tr key={i}>
            <td>
              {r.ResourceId
                ? r.ResourceId.split("/").slice(-1)[0]
                : "Unnamed"}
            </td>
            <td>
              ₹ {r.PreTaxCost !== undefined
                ? parseFloat(r.PreTaxCost).toFixed(2)
                : "0.00"}
            </td>
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  );
}

export default ResourceCost;