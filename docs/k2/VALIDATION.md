# Verificación del atlas K2

7 de octubre de 2026. Rama `feat/k2-atlas`, sobre `f73d76fe953b9198e1ebf5a59e83dda4664a14f9`. Los resultados son de ejecuciones reales en el entorno cloud, sin atribuirlos a un teléfono físico.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | Instalación reproducible, sin cambios de dependencias ni lockfile. |
| `pnpm check` | TypeScript correcto. |
| `pnpm test` | 219 pruebas aprobadas: 212 existentes y 7 contratos geográficos/cámara/calidad nuevos. |
| `pnpm test:k2` | 8 escenarios de navegador aprobados; informes originales y repetición específica conservados. |
| `pnpm test:e2e tests/e2e/base.spec.ts` | Prueba original aprobada en `/laboratorio/`. |
| `pnpm build` | Build estático correcto de atlas y laboratorio; [log](../../evidence/k2/build.log). |
| `node scripts/k2/smoke-production.mjs` | Build servido en 1440×900, 1280×720 y 390×844, sin desbordamiento horizontal ni solapamiento título/panel; selección preservada tras cambio de calidad; laboratorio funciona; cero errores de consola. |
| Pipeline repetido | SHA-256 idénticos para GLB, alturas, metadata, textura y anotaciones; [registro](../../evidence/k2/reproducibility.json). |

No existe script de lint en el repo. No se ejecutó toda la suite E2E histórica del laboratorio: su prueba base y disponibilidad se verificaron; sus rutas de navegación se actualizaron a `/laboratorio/`, conservando los casos existentes.

Los tests del atlas verifican carga, toggles sin regenerar ni descargar otra vez, fichas HTML, capas, teclas, modales, layouts, presets norte/este/sur, zoom, clearance, movimiento reducido, arrastre y pinza mediante CDP, interrupción de transición, fallo de asset y reintento, fallback sin WebGL, pérdida/restauración real del contexto y accesibilidad Axe WCAG A/AA de controles/lista HTML. Axe no certifica la accesibilidad del contenido visual del canvas.

[Resumen de los ocho casos](../../evidence/k2/browser-summary.json). Una ejecución completa posterior a la optimización tuvo siete aprobados y un fallo de conteo de descargas porque se regeneraron assets simultáneamente, provocando HMR en Vite. El caso afectado se repitió sin mutaciones y aprobó. Se conservan tanto ese informe como la repetición; no se presenta el fallo como una ejecución completa aprobada. El smoke final usa producción y no HMR.

Los tests unitarios comprueban transformación reversible este/norte/altitud, offset de 4 500 m y umbral de 8 000 m, muestreo de triángulos en cada LOD, rechazo de datos incompletos, anclaje de todos los puntos y muestras de rutas, referencias válidas, campamentos específicos de cada vía, único tramo compartido, oclusión por el macizo, trayectorias de cámara sobre el terreno y reparación de posiciones inválidas. También comprueban presupuesto de píxeles e histéresis de Auto.

## Recursos y calidad

Después de cargar los tres LOD y realizar 20 ciclos de rutas, vistas, foco y cambios de calidad, los conteos inicial/final fueron: **7 geometrías, 4 texturas, 8 programas**. Solo hubo tres preparaciones de terreno. El resultado está en [resource-cycles.json](../../evidence/k2/resource-cycles.json), con los 20 estados intermedios. Se mantiene un LOD visible y se conservan los demás para reutilizarlos. Estos conteos no prueban memoria GPU exacta ni ausencia universal de fugas.

| Perfil | Triángulos del terreno | Píxeles máximos del canvas | DPR máximo | Sombras |
|---|---:|---:|---:|---|
| Baja | 32 768 | 550 000 | 1,0 | Desactivadas |
| Media | 131 072 | 1 250 000 | 1,35 | Desactivadas |
| Alta | 524 288 | 2 400 000 | 1,75 | Un mapa de 1024² |

El presupuesto incluye un DPR mínimo de 0,5 para conservar legibilidad. En pantallas excepcionalmente grandes ese mínimo puede superar el límite nominal de píxeles. No hay postprocesado, bloom ni volumen. Las rutas añaden triángulos de líneas en píxeles. En la medición Baja se registraron 5–6 draw calls y 39 428–43 586 triángulos, sin pase de sombra adicional. `renderer.info` no se interpreta como tiempo GPU.

El detalle RGBA de 256² con mipmaps se estima en ~0,34 MiB. El diagnóstico añade una estimación conservadora de ~8 MiB para buffers de sombra en Alta; no mide memoria residente del controlador ni todos los buffers de geometría. Los GLB de detalle se cargan progresivamente; el navegador no procesa GeoTIFF.

## Rendimiento medido en producción

Comando: `node scripts/k2/measure.mjs`, con `pnpm preview --port 4173` activo, sin otros navegadores, tests ni builds simultáneos. Cada escenario dura al menos 30 s. Se registran todos los intervalos RAF exteriores, incluidos frames lentos; no se recortan a un rango favorable. Se utiliza la mediana y el percentil 95 por orden estadístico, sin confundirlos con la duración CPU de envío de comandos.

Entorno: Chromium 151 en Linux x86_64 headless; 3 núcleos y 8 GB declarados por el navegador; ANGLE **SwiftShader**, render por CPU; viewport **1440×900 CSS px**, DPR del dispositivo 1, perfil **Baja**, canvas **938×586**. La emulación 390×844 verifica layout/gestos, no rendimiento de un móvil.

| Escenario | Duración | Muestras | Mediana de frame | P95 | FPS equivalentes de la mediana |
|---|---:|---:|---:|---:|---:|
| Órbita general | 30,14 s | 163 | 183,3 ms | 333,4 ms | 5,46 |
| Bottleneck, órbita acotada | 30,06 s | 223 | 116,7 ms | 250,0 ms | 8,57 |
| Rutas y capas principales activadas | 30,07 s | 154 | 183,5 ms | 383,2 ms | 5,45 |

[Medición completa](../../evidence/k2/performance.json), con navegador/GPU, recursos, capas y estados. **No se alcanzó el objetivo de 30 FPS en este servidor con render por software.** No se dispone de medición en GPU física ni teléfono real, de modo que tampoco se garantiza ese objetivo en esos dispositivos.

La primera medición, conservada en [performance-before-material-optimization.json](../../evidence/k2/performance-before-material-optimization.json), dio 2,73 / 3,33 / 2,61 FPS equivalentes. Precalcular el albedo de Baja y usar iluminación Lambert mejoró aproximadamente 2× / 2,6× / 2,1×, manteniendo la geometría. Media/Alta conservan PBR y detalle triplanar; Auto limita equipos declarados pequeños, degrada con tiempos suavizados y evita recuperar calidad inmediatamente.

Se registraron **cero errores de navegador** durante la medida y **cero renders durante un segundo en reposo**, una vez estabilizada la vista. La descarga inicial fue **1 808 508 bytes (~1,81 MB)**, registrada mediante Resource Timing, incluyendo assets y fuentes locales; no equivale a memoria GPU ni al tamaño de todos los LOD residentes. Vite preview sirvió assets sin compresión HTTP: el valor mide esa transferencia local, sin suponer que producción use el mismo transporte.

## Capturas y límites geográficos

Capturas reales: [general de producción](../../evidence/k2/production-general.png), [rutas](../../evidence/k2/routes.png), [Bottleneck de producción](../../evidence/k2/production-bottleneck.png), [norte](../../evidence/k2/north.png), [este](../../evidence/k2/east.png), [móvil](../../evidence/k2/mobile.png) y [panel móvil de producción](../../evidence/k2/production-390.png). Se revisaron encuadres y relaciones de aristas desde esas orientaciones frente a las referencias listadas en SOURCES; no se hizo validación fotogramétrica.

El relieve procede de curvas de 150 m, con georreferenciación aproximada. El casquete de cumbre, serac, materiales y trazados son reconstruidos. La cuadrícula de 22,7 m es muestreo de render, sin certificar resolución observacional, datum vertical o hielo actual. House’s Chimney y Black Pyramid se describen sin inventar marcadores precisos. Fuente/precisión y reconstrucciones se muestran en la propia aplicación y en [SOURCES.md](SOURCES.md).
