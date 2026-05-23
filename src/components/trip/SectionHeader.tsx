export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="section-header">
      <div className="caps">{label}</div>
      <div className="line" />
    </div>
  );
}
