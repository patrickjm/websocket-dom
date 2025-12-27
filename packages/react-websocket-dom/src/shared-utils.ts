export type SerializedEvent = {
  type: string;
  target?: string;
  [key: string]: unknown;
};

export type MessageToWorker = {
  type: "_react_event";
  event: SerializedEvent;
};
