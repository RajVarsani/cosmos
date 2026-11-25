import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import { App } from "./app";
import { boot } from "./app/boot";

boot();
createRoot(document.getElementById("root")!).render(<App />);
