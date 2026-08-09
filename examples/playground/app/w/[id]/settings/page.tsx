import { SettingsForm } from "./form";

export default function SettingsPage({ params }: { params: { id: string } }) {
  return (
    <>
      <h2>Settings for workspace {params.id}</h2>
      <SettingsForm />
    </>
  );
}
