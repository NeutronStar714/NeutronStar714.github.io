"""Enable or archive the local editor without restarting the preview server."""
import argparse
from pathlib import Path
from photo_albums_store import PhotoAlbumStore

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("action", choices=["enable", "archive", "status"])
args = parser.parse_args()
store = PhotoAlbumStore(Path(__file__).resolve().parent)
if args.action != "status":
    store.set_enabled(args.action == "enable")
print("Photography editor: " + ("enabled" if store.enabled() else "archived"))
if store.enabled():
    print("http://127.0.0.1:4173/__album-editor")
