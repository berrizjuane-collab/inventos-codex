# Revisión visual de la versión inicial

Estado: **revisión técnica realizada por agentes y capturas finales renovadas**. El zoom nativo al 200 % también está verificado técnicamente. La aprobación y firma humanas de V05 permanecen pendientes. Una prueba de navegador aprobada no equivale a aprobación visual humana.

La matriz contiene 78 capturas renovadas: trece escenarios en los seis tamaños de VALIDATION.md. La ejecución completa previa aprobó 96/96 pruebas en 423,19 s, con cero fallos, casos omitidos o inestables; 78 corresponden a esta matriz. Su registro resumido se conserva en `evidence/e2e-regression-96-summary.json` y declara expresamente su procedencia. Después de la última corrección de estado pendiente, 19/19 flujos afectados pasan en 116,17 s; el informe íntegro es `evidence/e2e-affected-final.json`. Esa corrección no cambia la composición ni la geometría de la matriz. La revisión posterior confirmó controles de 40/44 px, presets de cámara coherentes y ausencia de nuevos recortes. Incluye además capturas y PNG de la caja estrecha desplazada, y captura completa del zoom nativo.

| Dato | Resultado registrado |
|---|---|
| Fecha | 2026-10-02 |
| Revisión Git | Árbol de trabajo de `work`, sin commit; no existe SHA de entrega |
| Navegador | Chromium 151.0.7922.173; matriz headless y zoom nativo con ventana en Xorg |
| Sistema operativo | Linux x86_64 |
| GPU/controlador/WebGL | WebGL2; ANGLE/Vulkan con SwiftShader por software |
| Capturas existentes / esperadas | 78 / 78 |
| Pruebas de navegador registradas | 96 / 96 previas en 423,19 s; 19 / 19 afectadas finales en 116,17 s |
| Revisión técnica | Agentes de implementación y revisión; `catalog` revisó 13 escenarios de 768 × 1024 y cinco capturas renovadas de 768/1024, `compute` cinco renovadas de escritorio y el agente principal tres móviles renovadas, la caja desplazada, el inspector y su PNG |
| Aprobación humana | Pendiente; no se ha atribuido firma a ninguna persona |
| Informes | [Resumen previo 96](../evidence/e2e-regression-96-summary.json), [informe final 19](../evidence/e2e-affected-final.json) y [zoom nativo](../evidence/native-zoom.json) |

El script importa configuraciones mediante el diálogo de la aplicación, espera la revisión aplicada y el fin de ambos workers, espera las fuentes y desactiva las animaciones de captura. Fija cámara, semillas Halton, ecuaciones, escalas y capas. No aprueba referencias automáticamente ni exige igualdad píxel a píxel entre GPU diferentes.

## Matriz de capturas

Las 78 rutas siguientes existen. La revisión técnica examinó composición, signos, dirección, capas, espaciado, legibilidad y paneles. Las 78 imágenes se renovaron después de corregir las alturas de controles y la precisión gráfica; los casos afectados se inspeccionaron de nuevo.

| Escenario | 1920x1080 | 1440x900 | 1280x720 | 1024x768 | 768x1024 | 390x844 | Revisión técnica |
|---|---|---|---|---|---|---|---|
| Pantalla inicial | [PNG](../evidence/captures/final-initial-1920x1080.png) | [PNG](../evidence/captures/final-initial-1440x900.png) | [PNG](../evidence/captures/final-initial-1280x720.png) | [PNG](../evidence/captures/final-initial-1024x768.png) | [PNG](../evidence/captures/final-initial-768x1024.png) | [PNG](../evidence/captures/final-initial-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Editor, parámetro helicoidal e inspector | [PNG](../evidence/captures/final-helix-editor-inspector-1920x1080.png) | [PNG](../evidence/captures/final-helix-editor-inspector-1440x900.png) | [PNG](../evidence/captures/final-helix-editor-inspector-1280x720.png) | [PNG](../evidence/captures/final-helix-editor-inspector-1024x768.png) | [PNG](../evidence/captures/final-helix-editor-inspector-768x1024.png) | [PNG](../evidence/captures/final-helix-editor-inspector-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Líneas y chevrones según F | [PNG](../evidence/captures/final-lines-1920x1080.png) | [PNG](../evidence/captures/final-lines-1440x900.png) | [PNG](../evidence/captures/final-lines-1280x720.png) | [PNG](../evidence/captures/final-lines-1024x768.png) | [PNG](../evidence/captures/final-lines-768x1024.png) | [PNG](../evidence/captures/final-lines-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Magnitud en corte perpendicular | [PNG](../evidence/captures/final-magnitude-slice-1920x1080.png) | [PNG](../evidence/captures/final-magnitude-slice-1440x900.png) | [PNG](../evidence/captures/final-magnitude-slice-1280x720.png) | [PNG](../evidence/captures/final-magnitude-slice-1024x768.png) | [PNG](../evidence/captures/final-magnitude-slice-768x1024.png) | [PNG](../evidence/captures/final-magnitude-slice-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Divergencia positiva: signos + y trama | [PNG](../evidence/captures/final-divergence-positive-1920x1080.png) | [PNG](../evidence/captures/final-divergence-positive-1440x900.png) | [PNG](../evidence/captures/final-divergence-positive-1280x720.png) | [PNG](../evidence/captures/final-divergence-positive-1024x768.png) | [PNG](../evidence/captures/final-divergence-positive-768x1024.png) | [PNG](../evidence/captures/final-divergence-positive-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Divergencia negativa: signos − y trama | [PNG](../evidence/captures/final-divergence-negative-1920x1080.png) | [PNG](../evidence/captures/final-divergence-negative-1440x900.png) | [PNG](../evidence/captures/final-divergence-negative-1280x720.png) | [PNG](../evidence/captures/final-divergence-negative-1024x768.png) | [PNG](../evidence/captures/final-divergence-negative-768x1024.png) | [PNG](../evidence/captures/final-divergence-negative-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Divergencia nula: 0, sin trama de signo | [PNG](../evidence/captures/final-divergence-zero-1920x1080.png) | [PNG](../evidence/captures/final-divergence-zero-1440x900.png) | [PNG](../evidence/captures/final-divergence-zero-1280x720.png) | [PNG](../evidence/captures/final-divergence-zero-1024x768.png) | [PNG](../evidence/captures/final-divergence-zero-768x1024.png) | [PNG](../evidence/captures/final-divergence-zero-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Rotacional con doble punta | [PNG](../evidence/captures/final-curl-1920x1080.png) | [PNG](../evidence/captures/final-curl-1440x900.png) | [PNG](../evidence/captures/final-curl-1280x720.png) | [PNG](../evidence/captures/final-curl-1024x768.png) | [PNG](../evidence/captures/final-curl-768x1024.png) | [PNG](../evidence/captures/final-curl-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Borrador inválido; revisión aplicada conservada | [PNG](../evidence/captures/final-invalid-expression-1920x1080.png) | [PNG](../evidence/captures/final-invalid-expression-1440x900.png) | [PNG](../evidence/captures/final-invalid-expression-1280x720.png) | [PNG](../evidence/captures/final-invalid-expression-1024x768.png) | [PNG](../evidence/captures/final-invalid-expression-768x1024.png) | [PNG](../evidence/captures/final-invalid-expression-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Dominio natural parcial: 1/x, sqrt(y), 0 | [PNG](../evidence/captures/final-partial-field-1920x1080.png) | [PNG](../evidence/captures/final-partial-field-1440x900.png) | [PNG](../evidence/captures/final-partial-field-1280x720.png) | [PNG](../evidence/captures/final-partial-field-1024x768.png) | [PNG](../evidence/captures/final-partial-field-768x1024.png) | [PNG](../evidence/captures/final-partial-field-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Malla 21³ y saturación visible | [PNG](../evidence/captures/final-maximum-density-1920x1080.png) | [PNG](../evidence/captures/final-maximum-density-1440x900.png) | [PNG](../evidence/captures/final-maximum-density-1280x720.png) | [PNG](../evidence/captures/final-maximum-density-1024x768.png) | [PNG](../evidence/captures/final-maximum-density-768x1024.png) | [PNG](../evidence/captures/final-maximum-density-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Ayuda con foco; archivos y retorno comprobados | [PNG](../evidence/captures/final-menu-help-focus-1920x1080.png) | [PNG](../evidence/captures/final-menu-help-focus-1440x900.png) | [PNG](../evidence/captures/final-menu-help-focus-1280x720.png) | [PNG](../evidence/captures/final-menu-help-focus-1024x768.png) | [PNG](../evidence/captures/final-menu-help-focus-768x1024.png) | [PNG](../evidence/captures/final-menu-help-focus-390x844.png) | Agentes: seis tamaños; capturas renovadas |
| Movimiento reducido y zoom simulado 200 % | [PNG](../evidence/captures/final-reduced-motion-zoom200-1920x1080.png) | [PNG](../evidence/captures/final-reduced-motion-zoom200-1440x900.png) | [PNG](../evidence/captures/final-reduced-motion-zoom200-1280x720.png) | [PNG](../evidence/captures/final-reduced-motion-zoom200-1024x768.png) | [PNG](../evidence/captures/final-reduced-motion-zoom200-768x1024.png) | [PNG](../evidence/captures/final-reduced-motion-zoom200-390x844.png) | Agentes: seis tamaños; capturas renovadas |

## Interpretación y límites de la matriz

- En escritorio, el caso helicoidal muestra editor, parámetro e inspector. Con paneles superpuestos, el recorrido modifica el parámetro y luego captura el inspector; la interfaz alterna los paneles. El caso de expresión inválida captura el editor abierto.
- `partial-field` representa el dominio natural parcialmente definido: `1/x` tiene un polo y `sqrt(y)` produce resultados complejos en y negativa. La revisión confirma huecos y codificación de datos no definidos, diferenciados de cero. Esta captura no representa un cálculo detenido por presupuesto.
- `menu-help-focus` verifica apertura y retorno del foco del diálogo Archivo; la imagen principal muestra Ayuda y su foco visible. Las comprobaciones funcionales de los diálogos están en el informe de navegador.
- El caso de 200 % de la matriz usa CDP con ancho y alto CSS al 50 % y DPR 2, y captura directamente mediante CDP para conservar esa configuración. Es una **emulación de distribución equivalente**. Movimiento reducido y dimensiones CSS se comprueban antes y después de la captura.
- El ensayo complementario usa zoom nativo con teclas reales Ctrl + (+) en Chromium con ventana sobre Xorg, sin emular dimensiones, escala de página ni zoom CSS. [native-zoom.json](../evidence/native-zoom.json) registra viewport CSS 1440×900 → 720×450, DPR 1 → 2 y ventana física constante. La [captura completa](../evidence/captures/h4-native-zoom-200.png) mide 1440×900 y preserva el zoom. Dos agentes revisaron legibilidad, foco y composición: sin colisiones ni desbordamiento horizontal, contenido vertical desplazable. La cámara conservada deja una escena pequeña al reducir el espacio CSS. Editor, inspector y ayuda siguen accesibles. Movimiento reducido emulado solo como preferencia de medios.
- Las pruebas geométricas comprueban ausencia de desplazamiento horizontal global y leyenda dentro del área visible. Los paneles y diálogos cubren intencionadamente parte de la escena; sus composiciones se revisan en las imágenes.
- Cada caso adjunta configuración aplicada, revisión, estados de cálculo, geometría DOM, DPR y ruta de imagen. Esos adjuntos acreditan el estado capturado. La dirección y legibilidad se revisan además visualmente.

## Comprobaciones técnicas con evidencia

Estas marcas describen la revisión técnica de las capturas existentes; no cierran la aprobación humana de V05.

- [x] Paleta neutra en 85 imágenes: 78 capturas de matriz, dos capturas complementarias y cinco PNG exportados. [palette-final.json](../evidence/palette-final.json) registra 95 103 912 píxeles RGB y cero píxeles con canales desiguales. Los PNG están en [evidence/exports](../evidence/exports).
- [x] Tipografía, números y ecuaciones legibles en los escenarios capturados; estados y ecuaciones corresponden al experimento aplicado.
- [x] Contrastes de tokens: texto principal 16,29:1; secundario 7,16:1; borde funcional 3,93:1; flechas 12,34:1. Evidencia en [h1-contrast.json](../evidence/h1-contrast.json). La inspección también revisa contornos sobre cortes claros.
- [x] Dirección indicada por puntas y chevrones; ceros representados sin asignar dirección. Campo y rotacional se distinguen mediante una y dos puntas y sus etiquetas.
- [x] Magnitud, escala y saturación distinguidas por longitud proporcional, anillo y contador. Las magnitudes pequeñas no se convierten en cero ni reciben longitud mínima artificial.
- [x] Divergencia positiva, negativa y nula identificadas por `+`, `−`, tramas opuestas y `0`; el signo no depende del gris.
- [x] Proyección vectorial y componente perpendicular identificadas mediante leyenda `Fₚ`, eje normal y `⊙+`/`⊗−`; los operadores y la magnitud escalar siguen siendo tridimensionales.
- [x] Semillas, selección y estados inválidos diferenciados por cruz, rombo doble y tramas/etiquetas; el inspector aporta valores y diagnósticos textuales.
- [x] Los seis tamaños capturados carecen de nuevos recortes o desplazamiento horizontal global; las leyendas conservan separación y área visible. La revisión de 768 × 1024 inspeccionó sus trece escenarios.
- [x] Foco y retorno de diálogos comprobados; [accessibility.json](../evidence/accessibility.json) y [accessibility-expanded.json](../evidence/accessibility-expanded.json) registran cero infracciones detectadas por axe. Sus dos comprobaciones incompletas requieren interpretación y no acreditan conformidad accesible exhaustiva.
- [x] Movimiento reducido y distribución CDP equivalente al 200 % comprobados en los seis tamaños.
- [x] Controles con mínimo global de 40 px y 44 px en móvil/puntero grueso. Capturas renovadas y regresión final aprobadas; los casos afectados fueron inspeccionados nuevamente por los agentes.
- [x] Caja estrecha desplazada: la representación conserva puntos distintos de la malla de 21³ al utilizar posiciones locales antes de convertir a Float32; el inspector, las etiquetas de 12 cifras significativas y el PNG conservan la lectura de coordenadas.
- [x] Zoom nativo del navegador al 200 % comprobado funcionalmente y captura completa revisada técnicamente por dos agentes. Evidencia y alcance descritos arriba.
- [ ] Aprobación visual y lista firmada por una persona conforme a V05.

## Incidencias y correcciones

| ID | Problema observado | Corrección | Evidencia posterior | Estado |
|---|---|---|---|---|
| VIS-01 | Preset de cámara activo no coincidía con la orientación real | El botón seleccionado se deriva de la cámara; importar/restablecer y cambiar de vista mantienen un estado coherente | Inicial, magnitud e inspector de la matriz | Corregido y capturado |
| VIS-02 | Algunos errores del analizador conservaban mensajes en inglés | Mensajes de validación presentados en español | `final-invalid-expression-*` | Corregido y capturado |
| VIS-03 | La captura convencional podía alterar la emulación de zoom o recortar la captura nativa | Captura CDP directa, comprobación de ancho CSS/DPR antes y después y dimensiones físicas del PNG | `final-reduced-motion-zoom200-*`, `h4-native-zoom-200.png` | Corregido; zoom emulado y nativo verificados técnicamente |
| VIS-04 | El corte necesitaba un encuadre perpendicular legible | Vista perpendicular explícita con ajuste al plano, respetando proporciones y la geometría 3D | `final-magnitude-slice-*`, `final-divergence-*` | Corregido y capturado |
| VIS-05 | El contenido gráfico podía colisionar con las instrucciones de cámara | Franja inferior reservada de 40 px en escritorio; instrucciones fuera del contenido gráfico | Inicial y capas de la matriz | Corregido y capturado |
| VIS-06 | El gráfico podía acercarse al indicador superior de densidad | Franja superior reservada de 36 px para el indicador | Inicial y malla máxima de la matriz | Corregido y capturado |
| VIS-07 | La vista móvil inicial resultaba densa y el corte quedaba pequeño | Inicio móvil con XY ajustado, magnitud y semillas visuales desactivadas; sus coordenadas se conservan | `final-initial-390x844.png` | Corregido y capturado |
| VIS-08 | Encabezados y controles podían colisionar con 195 px de ancho CSS | Reorganización de encabezados y acciones a ese ancho, correspondiente a 390 px físicos con emulación 200 % | `final-reduced-motion-zoom200-390x844.png` | Corregido y capturado |
| VIS-09 | El mensaje de estado podía desplazar o romper el pie | Altura fija, elipsis y separación de los metadatos | Pie de las capturas finales | Corregido y capturado |
| VIS-10 | Botones de vista de 32 px y algunos controles no alcanzaban el mínimo de DESIGN | Vistas, deslizadores, resumen de diagnósticos y etiquetas de casillas a mínimo 40 px; 44 px en móvil/puntero grueso | Matriz de 78 capturas renovada; inspección posterior de 13 imágenes afectadas; regresión 96/96 | Corregido y capturado |
| VIS-11 | La precisión Float32 podía fusionar muestras de cajas estrechas alejadas del origen y las etiquetas perdían detalle | Posiciones gráficas locales antes de convertir a Float32; valores originales en inspector y etiquetas de 12 cifras significativas | [Escena e inspector](../evidence/captures/final-narrow-offset-domain.png), [PNG](../evidence/exports/narrow-offset-1600.png) y regresión final | Corregido y capturado |

## Reproducir y completar la revisión

Ejecutar con un solo navegador, sin otra sesión Playwright concurrente:

```bash
pnpm exec playwright test tests/e2e/visual.spec.ts --workers=1
```

VIS-10 y VIS-11 están corregidos, con matriz renovada, comprobaciones finales aprobadas e inspección de las imágenes afectadas. El zoom nativo está verificado técnicamente con captura completa. El agente principal consolida los informes en STATUS.md. Para cerrar V05 permanece pendiente la aprobación visual y lista firmada por una persona; los resultados automatizados y la revisión técnica no se presentan como evidencia de esa aprobación humana.
