# Verificación del atlas K2

7 de octubre de 2026. Rama `feat/k2-atlas`, sobre `f73d76fe953b9198e1ebf5a59e83dda4664a14f9`. Esta revisión pule el render del atlas publicado en `02fa1b73d0d8e460d7b4e69fe7f8328548589a09`. Los resultados proceden de ejecuciones reales en el entorno cloud.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| Dependencias | Sin cambios de paquetes ni lockfile; instalación congelada verificada en la entrega inicial. |
| `pnpm check` / `pnpm build` | TypeScript y build estático correctos; el build final vuelve a ejecutar TypeScript. [Log final](../../evidence/k2/polish/build.log). |
| `pnpm test` | 219 pruebas aprobadas en 12 archivos; [log](../../evidence/k2/polish/unit.log). |
| `pnpm test:k2` | Nueve escenarios verificados, con informes originales y repeticiones específicas conservados. |
| Recursos | 20 ciclos reales de interacción y cambios de calidad, sin crecimiento de conteos. |
| Producción | Build servido en 1440×900, 1280×720 y 390×844; sin desbordamiento horizontal ni solapamiento título/panel; selección preservada al cambiar calidad; laboratorio disponible; cero errores de consola. [Resultado](../../evidence/k2/production-smoke.json). |
| Capturas finales | Los tres perfiles, norte/este, Bottleneck, luz de tarde y móvil; cero errores de navegador. [Estados y assets cargados](../../evidence/k2/polish/render-check.json). |
| Assets repetidos | SHA-256 idénticos al regenerar los seis assets visuales nuevos; los siete assets geográficos originales permanecen idénticos. [Registro](../../evidence/k2/polish/reproducibility.json). |

[Resumen de los nueve casos](../../evidence/k2/browser-summary.json). La ejecución completa de esta revisión tuvo siete aprobados y dos fallos de sincronización del test: el caso de 20 ciclos agotó 60 s al restablecer la vista final; el caso de nubes consultó el conteo antes del siguiente render. Se amplió a 120 s el plazo del primero y se hizo esperar al segundo por el estado y render efectivos. Ambos aprobaron después; volvieron a aprobar tras simplificar el shader de Baja. Se conservan el [informe completo original](../../evidence/k2/polish/browser-first-results.json), la [repetición final](../../evidence/k2/polish/browser-rerun-results.json) y su [log](../../evidence/k2/polish/browser-final-rerun.log). No se presenta una ejecución completa fallida como nueve aprobados en una sola ejecución. El smoke y las capturas finales usan producción, sin HMR.

Los escenarios comprueban carga, rutas/capas, fichas HTML, selección, teclas y modales, layouts, presets, zoom y clearance, movimiento reducido, arrastre y pinza mediante CDP, interrupción de transición, fallo de geometría o textura y reintento, fallback sin WebGL, pérdida/restauración real del contexto y Axe WCAG A/AA de controles y lista HTML. El interruptor de nubes cambia los draw calls efectivos sin descargar texturas ni preparar otra geometría. Axe no certifica la accesibilidad del contenido visual del canvas.

Los tests unitarios comprueban transformación reversible este/norte/altitud, offset de 4 500 m y umbral de 8 000 m, muestreo por LOD, rechazo de datos incompletos, anclaje de puntos y rutas, referencias válidas, campamentos específicos, único tramo compartido, oclusión, trayectorias sobre el terreno y reparación de posiciones inválidas. También comprueban presupuesto de píxeles e histéresis de Auto.

No existe script de lint. No se repitió toda la suite E2E histórica del laboratorio: su caso de disponibilidad aprobó en esta revisión y el smoke final verifica `/laboratorio/`; su prueba base se ejecutó en la entrega inicial.

## Recursos y calidad

Después de cargar los tres LOD y realizar 20 ciclos de rutas, vistas, foco y cambios de calidad, los conteos inicial/final fueron **10 geometrías, 7 texturas y 11 programas**. Solo hubo **3** preparaciones de terreno. [Registro con los 20 estados](../../evidence/k2/resource-cycles.json). Se conserva un LOD visible y se reutilizan los demás. Los conteos no prueban memoria GPU exacta ni ausencia universal de fugas.

| Perfil | Triángulos del terreno | Píxeles máximos del canvas | DPR máximo | Sombras |
|---|---:|---:|---:|---|
| Baja | 32 768 | 550 000 | 1,0 | Desactivadas |
| Media | 131 072 | 1 250 000 | 1,35 | Desactivadas |
| Alta | 524 288 | 2 400 000 | 1,75 | Un mapa de 1024² |

El DPR mínimo de 0,5 puede superar el límite nominal en pantallas excepcionalmente grandes. Todos los perfiles muestran albedo de roca y nieve registrado al relieve. Baja usa Lambert con detalle precalculado; Media/Alta añaden normales y grano triplanar. Se evita el muestreo triplanar por fragmento en Baja. No hay postprocesado, bloom ni raymarching de nubes en tiempo real: su volumen se prepara fuera del navegador y se representa con cinco sprites distantes ocluidos por el terreno. La escena se detiene en reposo y al ocultar la pestaña.

En la captura general Baja hay 13 draw calls y 55 730 triángulos, incluyendo cielo, hielo, rutas y sus bordes. En Alta, `renderer.info` registra 1 071 784 triángulos porque incluye el pase adicional de sombra; el terreno visible sigue teniendo 524 288. Los conteos no se interpretan como tiempo GPU.

El presupuesto de las cuatro texturas compartidas se estima en **46,67 MiB** con RGBA y mipmaps: dos mapas de 2048², grano de 512² y nube de 1024×512. El diagnóstico añade ~8 MiB tras crear la sombra de Alta, dando **54,67 MiB**; el buffer se conserva al volver a Baja. Es una estimación del presupuesto de texturas, no memoria residente del controlador ni buffers de geometría. Baja no usa el mapa de normales del terreno; sigue disponible para Media/Alta. Los bytes JPEG/PNG transferidos no equivalen al coste de su textura descomprimida. Los GLB se cargan progresivamente y el navegador no procesa GeoTIFF.

## Rendimiento medido en producción

Comando: `node scripts/k2/measure.mjs`, con `pnpm preview --port 4173` activo y sin otros navegadores, tests ni builds simultáneos. Cada escenario dura al menos 30 s. Se registran todos los intervalos RAF exteriores, incluidos frames lentos, sin recortar a un rango favorable. La mediana y el percentil 95 usan orden estadístico; la duración CPU de envío de comandos se registra por separado.

Entorno: Chromium 151, Linux x86_64 headless, 3 núcleos y 8 GB declarados por el navegador, ANGLE **SwiftShader**, render por CPU. Viewport **1440×900 CSS px**, DPR del dispositivo 1, perfil **Baja**, canvas **938×586**. Ambas rutas y nubes están activas. La emulación 390×844 verifica layout y gestos; no mide un móvil físico.

| Escenario | Duración | Muestras | Mediana de frame | P95 | FPS equivalentes de la mediana |
|---|---:|---:|---:|---:|---:|
| Órbita general | 30.63 s | 81 | 383.3 ms | 700.0 ms | 2.61 |
| Bottleneck, órbita acotada | 30.08 s | 106 | 266.8 ms | 500.1 ms | 3.75 |
| Rutas y capas principales activadas | 30.11 s | 88 | 349.9 ms | 800.0 ms | 2.86 |

[Medición completa final](../../evidence/k2/performance.json), con entorno, recursos, capas y estados. **No se alcanzó el objetivo de 30 FPS en este servidor con render por software.** No se dispone de una medida en GPU física ni teléfono real para garantizar ese objetivo.

La [medición anterior al ajuste de Baja](../../evidence/k2/polish/performance-before-low-shader-optimization.json) conserva los resultados con grano triplanar en ese perfil. La [medición del render publicado anterior](../../evidence/k2/polish/performance-before-textures.json) se conserva como referencia histórica: cámara, materiales, rutas inicialmente activadas y nubes difieren, por lo que no representa una comparación aislada. Auto limita equipos pequeños, degrada con tiempos suavizados y espera antes de recuperar calidad.

En la medida final hubo **0 errores de navegador** y **1 render durante el segundo observado tras 500 ms de espera**. Una comprobación adicional, después de orbitar y esperar ocho intervalos consecutivos de 250 ms sin frames nuevos, registró **cero renders durante el siguiente segundo**; [evidencia de reposo](../../evidence/k2/polish/idle-check.json). La descarga inicial registrada mediante Resource Timing fue **4,806,094 bytes (~4.81 MB)**, incluyendo assets y fuentes locales. No equivale a memoria GPU ni al tamaño de todos los LOD residentes. Vite preview sirve un transporte local; esta cifra no presupone el mismo transporte HTTP en GPT Sites.

## Capturas y límites geográficos

Capturas reales del build final: [general en Baja](../../evidence/k2/polish/general.png), [general en Media](../../evidence/k2/polish/general-medium.png), [Bottleneck en Alta](../../evidence/k2/polish/bottleneck.png), [luz de tarde](../../evidence/k2/polish/evening.png), [norte](../../evidence/k2/polish/north.png), [este](../../evidence/k2/polish/east.png) y [móvil](../../evidence/k2/polish/mobile.png). Los encuadres se revisaron frente a las referencias de SOURCES; no se hizo validación fotogramétrica.

El relieve procede de curvas de 150 m con georreferenciación aproximada. Geometría, alturas y coordenadas de rutas no cambian en esta revisión. El casquete de cumbre, serac, materiales y trazados son reconstruidos; las nubes y el cielo son ilustrativos. La cuadrícula de 22,7 m y el texel visual de 5,67 m son muestreo de render, sin certificar resolución observacional, datum vertical o hielo actual. House’s Chimney y Black Pyramid se describen sin inventar marcadores precisos. Fuente, precisión y reconstrucciones se muestran en la aplicación y en [SOURCES.md](SOURCES.md).
