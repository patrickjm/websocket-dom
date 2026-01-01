const basePort = Number(process.env.SYNCUI_PORT ?? 3333);

export const NAV_PORT_A = basePort * 10 + 1;
export const NAV_PORT_B = basePort * 10 + 2;

export const NAV_ORIGIN_A = `http://localhost:${NAV_PORT_A}`;
export const NAV_ORIGIN_B = `http://localhost:${NAV_PORT_B}`;
