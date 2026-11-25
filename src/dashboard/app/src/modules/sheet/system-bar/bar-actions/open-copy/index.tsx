import { IconCopy, IconOpen } from "@/modules/ui/icons";
import { IconButton, IconLink } from "@/modules/ui/icon-button";
import { copy } from "@/state/actions";

// open and copy for a url; the shortcut hook looks for data-k="open" and [data-copyurl]
export function OpenCopy({ url, open }: { url: string | null; open: boolean }) {
  return (
    <>
      <IconLink href={open && url ? url : undefined} data-k="open" title={url ? `Open ${url.replace(/^https?:\/\//, "")}  (O)` : undefined} aria-label="open in browser"><IconOpen /></IconLink>
      <IconButton data-k="copy" data-copyurl={url || ""} disabled={!url} title="Copy URL  (C)" aria-label="copy URL" onClick={() => url && copy(url)}><IconCopy /></IconButton>
    </>
  );
}
