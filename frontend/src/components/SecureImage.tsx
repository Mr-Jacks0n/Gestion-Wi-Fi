/* ============================================================
   SecureImage — affiche une image privée du dossier /uploads
   via une requête authentifiée (JWT) et un blob URL local.

   Les fichiers d'uploads ne sont plus servis publiquement
   (StaticFiles supprimé côté API) : chaque accès exige un token.
   ============================================================ */

import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import api from '../lib/api';

interface SecureImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Chemin stocké en BDD (ex: "uploads/wave_qr/wave_qr_2_x.png") */
  srcPath: string;
}

function toSecurePath(path: string): string {
  // uploads/wave_qr/fichier.png  ->  wave_qr/fichier.png
  return path.replace(/^uploads\//, '').replace(/^\/+/, '');
}

export default function SecureImage({ srcPath, ...imgProps }: SecureImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setFailed(false);

    api
      .get(`/api/uploads/${toSecurePath(srcPath)}`, { responseType: 'blob' })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        setBlobUrl(objectUrl);
      })
      .catch(() => setFailed(true));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [srcPath]);

  if (failed) return null;
  if (!blobUrl) return null;
  return <img src={blobUrl} {...imgProps} />;
}
