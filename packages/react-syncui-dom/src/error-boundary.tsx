import React, { Component, type ErrorInfo, type ReactNode } from "react";
import type WebSocket from "ws";

interface Props {
  ws: WebSocket;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export function handleError(ws: WebSocket, error: Error) {
  console.error(error);
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  ws.send(
    JSON.stringify({
      type: "error",
      error: error.message,
    })
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(error, errorInfo);
    this.setState({ error, errorInfo });
    handleError(this.props.ws, error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
