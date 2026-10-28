# infra/ — la infraestructura en AWS

`template.yaml` es la plantilla de AWS SAM. Crea todo con un solo comando (`scripts/deploy.sh`):

- S3 privado + CloudFront con HTTPS para la página.
- API Gateway (`POST /simulate`) con límite de 5 peticiones por segundo.
- Lambda `simulate` (coordina) y Lambda `batch` (corre los lotes en paralelo).
- S3 para guardar resultados (caché que expira a los 30 días).
- AWS Budget con alerta por correo.

Permisos mínimos: cada Lambda solo puede hacer lo que necesita. Checkov revisa la plantilla.
