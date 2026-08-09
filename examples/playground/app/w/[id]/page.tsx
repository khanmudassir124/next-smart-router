import { Suspense } from "react";

import { WorkspaceControls } from "./controls";
import { workspaceSearch } from "./search-params";

export default function WorkspacePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { view, page } = workspaceSearch.parse(searchParams);

  return (
    <>
      <h2>Workspace {params.id}</h2>
      <p>
        Rendered on the server as <b>{view}</b>, page <b>{page}</b>.
      </p>
      {/*
        useQueryStates reads useSearchParams() so its values are correct during
        SSR — which means Next needs a Suspense boundary to statically prerender
        this page. Same rule as using useSearchParams() directly.
      */}
      <Suspense fallback={null}>
        <WorkspaceControls />
      </Suspense>
    </>
  );
}
