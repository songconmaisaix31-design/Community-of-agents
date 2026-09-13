import { redirect } from "next/navigation";
// Next removes trailing slashes. Use a child page inside the strict /demo/ SW scope.
export default function Page() { redirect("/demo/space"); }
