/**
 * Where the web app reaches ARP's sponsor (task 53c). `VITE_ARP_SPONSOR_URL` when set; otherwise,
 * in `vite dev` only, its local default, as the activity feed does (`agent-feed-live.ts`). A
 * deployed build never posts to its visitor's localhost unless someone asked it to.
 */
const configured: string | undefined = import.meta.env.VITE_ARP_SPONSOR_URL;

export const SPONSOR_URL: string | undefined =
    configured !== undefined && configured.length > 0
        ? configured
        : import.meta.env.DEV
          ? "http://127.0.0.1:3200"
          : undefined;
