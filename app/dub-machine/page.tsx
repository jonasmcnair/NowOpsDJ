export default function DubMachinePage() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
      {/* Nav bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid #2a2a2a', background: '#111111', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, background: '#e63312', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', letterSpacing: '0.1em' }}>DJ SET ARCHITECT</span>
          </a>
          <span style={{ color: '#2a2a2a' }}>|</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#e63312', letterSpacing: '0.1em' }}>DUB MACHINE</span>
        </div>
        <a href="/" style={{ fontFamily: 'monospace', fontSize: 11, color: '#555', textDecoration: 'none', letterSpacing: '0.08em' }}>
          ← BACK TO SET BUILDER
        </a>
      </div>

      {/* Drum machine iframe */}
      <iframe
        src="/dub-machine.html"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Dub Machine"
      />
    </div>
  );
}
