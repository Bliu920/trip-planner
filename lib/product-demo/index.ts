import { createElement } from "react";
import { demoBudget, demoDays } from "./data";
import { DemoWorkspace } from "./workspace";
import "./demo.css";

export { demoDays, demoBudget } from "./data";

export function ProductDemo() {
  // Compose the sample workspace.
  return createElement(DemoWorkspace, { days: demoDays, budget: demoBudget });
}
