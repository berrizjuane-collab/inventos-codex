# Estado de implementación

Fecha: 2 de octubre de 2026. Versión 1.0.0. Aplicación inicial implementada y entrega ejecutable verificada; cierre formal de H4 parcial por los requisitos externos indicados abajo.

## Aplicación y checks

La versión inicial incluye seis campos, editor de expresiones validado, parámetros, dominio, malla, inspector y jacobiano, líneas RK4, semillas, cortes, operadores tridimensionales, escalas, cámara ortográfica, exportación PNG y recuperación JSON. Interfaz y representación exclusivamente monocromáticas.

| Check | Estado | Evidencia |
|---|---|---|
| H0: documentos y entorno reproducible | [x] | Referencias de raíz, lockfile, `clean-*.log` y `reproducibility.json` |
| H1: catálogo, escena y dirección visual | [x] | `h1-math.json`, `h1-contrast.json` y capturas |
| H2: edición, operadores e inspector | [x] | `h2-unit.json` y flujos H2 |
| H3: líneas, cortes y legibilidad | [x] | `streamline-errors.json`, `h3-unit.json` y flujos H3 |
| E01: PNG, JSON y recuperación | [x] | Seis flujos H4, `exports/` y `graphics-precision.json` |
| Q02: regresión matemática | [x] | 212/212 unitarias; 34 000 comparaciones independientes, cero fallos |
| Q03: flujos y accesibilidad | [x] | Regresión afectada 19/19; teclado 76/76; axe sin violaciones detectadas; zoom nativo 200 % verificado |
| V05: revisión visual | [ ] Parcial | Matriz de 78 capturas y revisión técnica completadas; falta aprobación humana firmada |
| Q04: rendimiento reproducible | [ ] Parcial | Ensayo Linux completo; incumplimiento de fluidez gráfica y controles; equipo Windows no disponible |
| D01: entrega documentada | [ ] Parcial | Aplicación, documentación y paquete ejecutable entregables; dependen formalmente de V05 y Q04 |

## Evidencia final

- Matemática: 212 pruebas en 11 archivos, tanto en el checkout como en instalación limpia; 16 casos, 2 000 muestras y 34 000 comparaciones con cero fallos. Las tolerancias y errores RK4 están en [MATHEMATICS.md](docs/MATHEMATICS.md) y [VALIDATION-RESULTS.md](docs/VALIDATION-RESULTS.md).
- Navegador: regresión completa previa de 96/96 en 423,19 s, con 78 casos de matriz. Su registro resumido declara la procedencia en [e2e-regression-96-summary.json](evidence/e2e-regression-96-summary.json). Después de corregir el estado pendiente antes de los efectos React, 19/19 flujos afectados pasan en 116,17 s; informe íntegro [e2e-affected-final.json](evidence/e2e-affected-final.json). Esa última corrección no modifica composición ni geometría.
- Precisión gráfica: diez pruebas geométricas y el flujo renderizado verifican una malla de 21 puntos por eje de ancho 0,001 cerca de 10000. La caja desplazada coincide píxel a píxel con su equivalente centrado; selección, etiquetas, inspector, JSON y PNG conservan las coordenadas globales.
- Diseño: mínimos de controles 40/44 px, seis tamaños de pantalla y signos/capas revisados en capturas. [palette-final.json](evidence/palette-final.json) registra 85 imágenes, 95 103 912 píxeles y cero píxeles fuera de grises neutros. La revisión técnica se documenta en [VISUAL-REVIEW.md](docs/VISUAL-REVIEW.md).
- Zoom nativo: Chromium con ventana real y teclas Ctrl + (+), sin emular dimensiones, escala de página ni zoom CSS. Viewport CSS 1440×900 → 720×450, DPR 1 → 2, ventana física constante; captura completa 1440×900 conserva ese estado. Editor, inspector, ayuda y retorno del foco accesibles, desplazamiento vertical disponible y sin desbordamiento horizontal. Movimiento reducido emulado solo como preferencia de medios. [native-zoom.json](evidence/native-zoom.json).
- Accesibilidad: 76/76 elementos alcanzables por Tab, cámara por teclado, diálogos con Escape y retorno de foco; axe no detecta infracciones WCAG en los estados comprobados. Dos comprobaciones incompletas requieren interpretación: esto no acredita una certificación accesible exhaustiva.
- Reproducción: instalación congelada, comprobación TypeScript, build y pruebas limpios; 107 archivos de compilación idénticos por SHA-256 entre ambas copias. [reproducibility.json](evidence/reproducibility.json). El paquete añade los avisos de terceros junto a la aplicación compilada. La ejecución de `dist/` mediante Python HTTP verifica carga fría, cálculo, exportación PNG y recuperación JSON exacta: 14 peticiones locales correctas y cero errores, en [delivery-smoke.json](evidence/delivery-smoke.json).

## Rendimiento y límites

Producción en Linux, AMD EPYC 9V74, 5 vCPU, unos 33,3 GiB y Chromium 151.0.7922.173 con SwiftShader por software. Cinco órbitas de 30 s, calentamiento de 10 s, revisiones de campo y líneas comprobadas y vértices positivos en cada configuración. Informe y protocolo en [VALIDATION-RESULTS.md](docs/VALIDATION-RESULTS.md).

| Medición | Mediana / p95, ms | Objetivo | Resultado local |
|---|---|---|---|
| Fotograma | 66,6 / 100,0 | p95 ≤ 33,3 ms | Incumplido |
| Control | 227,4 / 297,7 | p95 ≤ 100 ms | Incumplido |
| Campo | 79,5 / 99,8 | p95 ≤ 500 ms | Cumplido |
| Líneas | 78,7 / 108,8 | p95 ≤ 2000 ms | Cumplido |
| Cancelación, cota superior por validación FIFO | 1,0 / 1,0 | ≤ 100 ms | Cumplido |

Cincuenta cambios con 21³ muestras y 64 semillas terminaron sin errores JavaScript ni pérdidas de WebGL y con recursos estables por campo. La medida de cancelación es una cota por la cola del worker, no una traza interna exacta. No hay evidencia de rendimiento en GPU física. Mallas y capas densas reducen la lectura en pantallas pequeñas; controles de capas, corte, escala e inspector permiten examinar los datos. Gramática, dominio, singularidades, detección aproximada de cierre y presupuestos de cálculo están documentados en MATHEMATICS.md.

## Entrega y requisitos pendientes

`entrega-campo-v1.zip` incluye `dist/` ejecutable mediante servidor HTTP, código, pruebas, scripts, referencias aprobadas, documentación y evidencias. `DELIVERY-MANIFEST.json` identifica tamaño y SHA-256 de cada archivo; `entrega-campo-v1.sha256` verifica el ZIP. El empaquetador verificó CRC, tamaño y SHA-256 de cada entrada del paquete de 329 archivos. Las instrucciones de ejecución y uso están en [README.md](README.md). No se necesita reconstruir para servir `dist/`.

- V05: falta la aprobación visual humana y la lista firmada. La inspección técnica de agentes está completada; el check se cierra cuando una persona revise y firme la lista visual.
- Q04: falta ejecutar y satisfacer el protocolo en Windows i9-13900H/16 GiB, registrando GPU, controlador, navegador, alimentación y pantalla. Los tiempos locales de fotogramas y controles incumplen sus objetivos y deben volver a evaluarse en ese equipo; cualquier incumplimiento que persista necesita corrección.
- D01/H4: conservan estado parcial por esas dos dependencias, aunque aplicación y documentación se entregan.
- Entorno cloud: instalación y arranque guardados como borrador, sin cambiar red ni secretos; `cloud-setup.sh` ejecutado correctamente. La restauración desde un entorno nuevo no se ha verificado. El repositorio carece de primer commit; el ZIP conserva todo el trabajo, sin publicación ni despliegue externo.

No se han rebajado criterios ni marcado tareas parcialmente verificadas como completas.
