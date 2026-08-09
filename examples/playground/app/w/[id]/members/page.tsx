export default function MembersPage({ params }: { params: { id: string } }) {
  return <h2>Members of workspace {params.id}</h2>;
}
