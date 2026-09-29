import { createRoot } from "react-dom/client";
import { BulletinSpace } from "./BulletinSpace";
const root = document.getElementById("gongzhi-app");
if (root) createRoot(root).render(<BulletinSpace mode={root.dataset.mode === "demo" ? "demo" : "live"} />);
