import { buildHref } from "next-smart-router";
import { SmartLink } from "next-smart-router/react";

export default function Home() {
  return (
    <>
      <h1>next-smart-router playground</h1>
      <ul>
        <li>
          <SmartLink href={buildHref("/w/[id]", { id: 42 })}>Workspace 42</SmartLink>
        </li>
        <li>
          <SmartLink href={buildHref("/docs/[...slug]", { slug: ["getting started"] })}>
            Docs (encoded catch-all)
          </SmartLink>
        </li>
        <li>
          <SmartLink href="/?locale=fr">Set a sticky locale</SmartLink>
        </li>
      </ul>
    </>
  );
}
