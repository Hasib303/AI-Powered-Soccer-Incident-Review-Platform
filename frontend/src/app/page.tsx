import { redirect } from "next/navigation";

export default function HomePage() {
  // The proxy bounces authenticated users to their landing page; everyone
  // else lands on /login. We just funnel both shapes through here.
  redirect("/login");
}
