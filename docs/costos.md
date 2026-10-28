# Declaración de costos

Región: **us-east-1**. Precios públicos de AWS (lista on-demand) consultados para esta estimación; conviene confirmarlos en la [calculadora de AWS](https://calculator.aws/) antes del pitch.
Todo es serverless: **si nadie usa la aplicación, el costo es prácticamente cero**.

## 1. Cuánto cuesta una simulación en la nube

Una consulta de 200 simulaciones (más la optimización de 12 políticas × 6 corridas de entrenamiento) usa unos **60 GB-segundo** de Lambda (≈ 35 s de CPU repartidos entre 8 funciones de 1.769 MB, arm64). *Medición propia aproximada; se actualizará con los datos reales de CloudWatch tras el despliegue.*

| Concepto | Cálculo | Costo por consulta |
|---|---|---|
| Lambda (cómputo arm64, USD 0,0000133334 por GB-s) | 60 GB-s × 0,0000133334 | USD 0,0008 |
| Lambda (peticiones, USD 0,20 por millón) | 9 invocaciones | USD 0,000002 |
| API Gateway HTTP (USD 1,00 por millón) | 1 petición | USD 0,000001 |
| S3 (guardar el resultado en caché) | 1 PUT + 1 GET | USD 0,000006 |
| **Total** | | **≈ USD 0,001** |

Si se repite una configuración ya simulada, la respuesta sale de la caché en S3: **no se vuelve a pagar el cómputo**.

## 2. Cuánto costaría operar el sistema un mes

Escenario de uso: un comité municipal que hace **1.000 consultas de 200 simulaciones al mes** y 1.000 visitas a la web.

| Servicio | Uso mensual | Cálculo sin capa gratuita | Con capa gratuita de AWS |
|---|---|---|---|
| Lambda | 60.000 GB-s, 9.000 invocaciones | 60.000 × 0,0000133334 = USD 0,80 | USD 0 (incluye 400.000 GB-s y 1 M de peticiones al mes) |
| API Gateway HTTP | 1.000 peticiones | USD 0,001 | USD 0 |
| S3 (web + caché) | < 100 MB, ~3.000 peticiones | USD 0,01 | USD 0 |
| CloudFront | ~0,3 GB transferidos | 0,3 × 0,085 = USD 0,03 | USD 0 (1 TB al mes gratis) |
| CloudWatch Logs | < 0,1 GB, retención 7 días | USD 0,05 | USD 0 (5 GB gratis) |
| AWS Budgets | 1 presupuesto | USD 0 | USD 0 |
| **Total** | | **≈ USD 0,90 al mes** | **≈ USD 0 al mes** |

Para escalar a toda la provincia de Manabí (≈ 1,6 millones de habitantes) con el mismo nivel de detalle por agente, el cómputo crece en proporción (~6×): **≈ USD 5–6 al mes** sin capa gratuita.

Controles de costo incluidos en la infraestructura:
- **AWS Budget** mensual de USD 5 con alerta por correo al 50 % real y al 100 % proyectado (`infra/template.yaml`, recurso `Budget`).
- Límite de **5 peticiones por segundo** en la API, para que un abuso no dispare la factura.
- Máximo **1.000 simulaciones por consulta** en la nube.
- Logs con **retención de 7 días** y caché con **expiración a 30 días**.
- Sin servidores encendidos, sin NAT Gateway, sin bases de datos de pago por hora.

## 3. Cuánto se gastó realmente durante el evento

| Fecha | Gasto acumulado (AWS Budgets) | Evidencia |
|---|---|---|
| 28-oct-2026, 08:59 (hora de Ecuador) | **USD 0,00** de USD 5,00 (0 %) | [`docs/budget.png`](budget.png) y `aws budgets describe-budgets` |

Todo el uso del evento (pruebas de la API, Lambda, S3 y CloudFront) quedó dentro de la capa gratuita, por eso el gasto real es cero. Coincide con la estimación de la sección 2. AWS aclara que los datos de gasto pueden tardar hasta 24 horas en aparecer.
