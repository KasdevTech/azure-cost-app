import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import ResourceCost from "./components/ResourceCost";

ReactDOM.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/resources" element={<ResourceCost />} />
    </Routes>
  </BrowserRouter>,
  document.getElementById("root")
);