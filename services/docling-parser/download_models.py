"""Build-time only: pin immutable upstream model snapshots and record file hashes."""
import hashlib
import json
from pathlib import Path
from huggingface_hub import snapshot_download

root = Path('/models')
for repo, revision in json.loads(Path('models.json').read_text()).items():
    snapshot_download(repo_id=repo, revision=revision,
                      local_dir=root / repo.replace('/', '--'),
                      allow_patterns=(['model_artifacts/tableformer/**']
                                      if repo.endswith('docling-models') else None))
manifest = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file() and '.cache' not in p.parts}
(root / 'sha256.json').write_text(json.dumps(manifest, sort_keys=True))
