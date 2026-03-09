import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createRouter } from "./router";
import "./styles.css";

const router = createRouter();

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
