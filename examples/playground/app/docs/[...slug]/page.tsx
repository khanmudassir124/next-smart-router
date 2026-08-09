export default function DocsPage({ params }: { params: { slug: string[] } }) {
  return (
    <>
      <h2>Docs</h2>
      {/* Next decodes these itself; getParams() matches that behaviour. */}
      <p>slug: {JSON.stringify(params.slug)}</p>
    </>
  );
}
