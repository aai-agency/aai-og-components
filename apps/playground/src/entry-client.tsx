import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { createRouter } from "./router";
import "./styles.css";

const router = createRouter();

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<RouterProvider router={router} />);
}
