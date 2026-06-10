interface NavItem {
  id: string;
  label: string;
}

// Adding a new module is one line here
const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "runner", label: "CLI Runner" },
];

interface NavigationProps {
  activeId: string;
  onNavigate: (id: string) => void;
}

export default function Navigation({ activeId, onNavigate }: NavigationProps) {
  return (
    <nav
      style={{
        width: 240,
        flexShrink: 0,
        background: "#0f0f0f",
        borderRight: "1px solid #1f1f1f",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
        height: "100vh",
        boxSizing: "border-box",
      }}
    >
      {/* App title */}
      <div
        style={{
          padding: "0 20px 20px",
          fontSize: 16,
          fontWeight: 700,
          color: "#e5e5e5",
          letterSpacing: 1,
          borderBottom: "1px solid #1f1f1f",
          marginBottom: 8,
        }}
      >
        FORGE
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: isActive ? "#1e3a5f" : "transparent",
              color: isActive ? "#3b82f6" : "#a3a3a3",
              border: "none",
              borderLeft: `3px solid ${isActive ? "#3b82f6" : "transparent"}`,
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              cursor: "pointer",
              transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLButtonElement).style.background =
                  "#141414";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
