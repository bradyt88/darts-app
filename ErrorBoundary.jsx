import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface it in the console for debugging; swap for real error
    // reporting (Sentry, etc.) later if this app grows.
    console.error("Dark Mind crashed:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            background: "#04150c",
            color: "#ECF6EF",
            fontFamily: "Inter, -apple-system, sans-serif",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</div>
          <div style={{ fontSize: 13, color: "#93A79A", maxWidth: 320 }}>
            Dark Mind hit an unexpected error. Your saved stats and profile are untouched — reloading should fix it.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              background: "#3FE07A",
              color: "#06210F",
              border: "none",
              borderRadius: 4,
              padding: "10px 18px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
