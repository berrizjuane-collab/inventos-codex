# Resultados de validación

Fecha: 2 de octubre de 2026. Versión de aplicación y motor: 1.0.0.

El alcance aprobado se conserva en SPEC.md, DESIGN.md, PLAN.md y VALIDATION.md. Este registro identifica resultados medidos y sus límites; no sustituye las aprobaciones externas.

## Matemática y representación

Las 212 pruebas unitarias finales pasan en once archivos, sin fallos. Incluyen catálogo, gramática y límites del AST, evaluación del campo original en singularidades, jacobiano, diferencias finitas, fiabilidad, RK4 fijo y adaptativo, cancelación y publicación de revisiones, escalas, signos, esquema de intercambio, metadatos PNG y coordenadas de GPU. Informe: [h4-unit.json](../evidence/h4-unit.json).

El informe independiente [math-final.json](../evidence/math-final.json) compara 16 casos y 2000 muestras con 34000 referencias escalares, sin fallos. Usa la regla `|obtenido−referencia| ≤ atol + rtol·|referencia|`, sin redondear antes de comparar. Los seis campos del catálogo usan referencias cerradas en modo automático y diferencias finitas; se añaden campos polinómico y trigonométrico.

| Caso | Error medido |
|---|---:|
| Catálogo automático: componentes y operadores | 0 |
| Catálogo finito: mayor error de operador | < 8e−13 |
| Campo trigonométrico finito: mayor error de operador | 1,109e−7 |
| Círculo rotacional, 128 pasos, una vuelta | 9,003e−8 |
| Hélice, 128 pasos | 2,154e−7 |
| Cociente de errores de hélice al dividir el paso por dos | 17,008 y 16,222 |
| Invariante radial: producto vectorial | 1,111e−16 |
| Invariante de silla: producto xy | 7,112e−7 |

La tolerancia adaptativa diez veces menor reduce el error geométrico máximo de 2,325e−5 a 2,619e−6. Los valores de integración y paradas se encuentran en [streamline-errors.json](../evidence/streamline-errors.json). Estas pruebas no certifican campos arbitrarios ni regularidad entre muestras.

La caja `[9999.999,10000]³`, con malla de 21³ puntos y anchura de 0,001, conserva sus posiciones mediante coordenadas locales antes de convertirlas a Float32. Las diez pruebas geométricas incluyen ambos límites ±10000, matrices instanciadas, selección, líneas y cortes XY/XZ/YZ. La comparación en navegador con una caja centrada del mismo tamaño produce una diferencia media de 0 en los píxeles de primer plano. Un clic interior en la caja desplazada conserva coordenadas globales distintas del centro, operadores y cámara en PNG y JSON. Evidencia: [graphics-precision.json](../evidence/graphics-precision.json) y [captura](../evidence/captures/final-narrow-offset-domain.png).

## Recuperación, accesibilidad y funcionamiento local

Los flujos H4 comprueban ida y vuelta de todos los ajustes, conservación del borrador sin aplicarlo, recuperación exacta de cámara, semillas exteriores, rechazo de JSON corrupto, versiones o esquemas ajenos, claves desconocidas y exceso de semillas. Los PNG de ambos tamaños incluyen expresiones extensas sin pérdida de metadatos. Archivos reales: [exports](../evidence/exports/).

La ejecución posterior al último ajuste del estado de cálculo supera 19 de 19 flujos afectados en 116,17 s, sin fallos, casos omitidos ni inestables. Su informe conservado es [e2e-affected-final.json](../evidence/e2e-affected-final.json); `e2e-results.json` contiene el informe de la última ejecución y puede sobrescribirse al repetir las pruebas. Incluye respuestas retrasadas de ambos workers: una respuesta anterior no sustituye la revisión vigente, y la exportación permanece deshabilitada mientras faltan sus resultados. Evidencia específica: [async-state.json](../evidence/async-state.json). Este recorrido se distingue de la ejecución anterior de 96 pruebas que produjo las 78 capturas visuales. Su [resumen conservado](../evidence/e2e-regression-96-summary.json) transcribe las estadísticas y la salida de terminal; no es el informe completo de Playwright. No se suman ambos recuentos como si fueran una sola ejecución.

Se recorren 76 controles habilitados mediante Tab, incluidos formularios desplegados, cámara, inspector y jacobiano: todos se alcanzan y muestran foco. Los dos análisis axe de estados inicial y expandido no detectan violaciones WCAG2A/AA ni WCAG2.1AA. Esto no constituye una certificación completa de accesibilidad. Informes: [keyboard.json](../evidence/keyboard.json), [accessibility.json](../evidence/accessibility.json), [accessibility-expanded.json](../evidence/accessibility-expanded.json).

Sin WebGL siguen funcionando editor, inspector numérico y JSON. Tras perder el contexto se informa del problema; el cálculo y guardado numéricos continúan. Tras cargar la aplicación y cortar la red se prueban catálogo, inspector y JSON, sin solicitudes externas. Es necesario conservar el servidor HTTP local; no hay PWA ni instalación offline automática. Informe: [offline.json](../evidence/offline.json).

La matriz visual contiene trece escenarios en seis tamaños. Comprueba distribución equivalente al 200 % mediante CDP y movimiento reducido. Un recorrido adicional verifica zoom **nativo** al 200 % en Chromium con ventana, activado mediante teclas reales: el viewport CSS pasa de 1440 × 900 a 720 × 450 y el DPR de 1 a 2, sin emulación de métricas ni zoom CSS. Editor, inspector y ayuda conservan acceso y retorno de foco; no se detecta desplazamiento horizontal ni errores. El contenido vertical se puede desplazar y la captura completa de 1440 × 900 píxeles conserva el zoom. En ese recorrido solo se emula la preferencia de movimiento reducido. Evidencia: [native-zoom.json](../evidence/native-zoom.json) y [captura](../evidence/captures/h4-native-zoom-200.png). Q03 queda verificado técnicamente con estas pruebas y sus límites de cobertura.

La inspección técnica de los agentes se documenta en [VISUAL-REVIEW.md](VISUAL-REVIEW.md); V05 exige aprobación humana. El análisis final de 85 imágenes comprueba 95 103 912 píxeles RGB, sin ningún píxel con canales desiguales: [palette-final.json](../evidence/palette-final.json).

## Rendimiento y estabilidad

La aplicación compilada también se sirve mediante Python HTTP, sin el servidor de desarrollo ni dependencias de Node en el servidor. La comprobación de carga fría, worker, exportación PNG y recuperación JSON exacta pasó con 14 peticiones locales correctas y cero errores. La espera comprueba el campo aplicado solicitado y el fin del cálculo, incluida la importación. Evidencia: [delivery-smoke.json](../evidence/delivery-smoke.json).

La medición final usa la compilación de producción en Linux x64, con cinco vCPU AMD EPYC 9V74, aproximadamente 33,3 GiB de RAM, Chromium 151 y WebGL2 mediante ANGLE/SwiftShader por software. La ventana mide 1440 × 900, con DPR 1. La máquina virtual no aporta frecuencia física de pantalla ni un estado de alimentación comparable al equipo aprobado.

El perfil normal contiene una malla de 17³, 32 semillas, corte de 65² y líneas visibles: 3288 vértices. Tras 10 s de calentamiento se repiten cinco órbitas de 30 s con el mismo recorrido de cámara. Los intervalos de fotograma incluyen planificación y carga gráfica; no son tiempos de cálculo aislados. Campo y líneas se miden por peticiones completas a sus workers. La cancelación es un límite superior medido mediante una petición de validación posterior en la misma cola FIFO.

| Medida | p95 observado | Límite aprobado | Resultado en este entorno |
|---|---:|---:|---|
| Intervalo de fotograma | 100 ms | 33,3 ms | No cumple |
| Respuesta de controles | 297,7 ms | 100 ms | No cumple |
| Campo y corte | 99,8 ms | 500 ms | Cumple |
| Líneas de corriente | 108,8 ms | 2000 ms | Cumple |
| Cancelación, límite superior FIFO | 1 ms | 100 ms | Cumple |

El perfil máximo alterna 50 veces entre hélice y rotación, con malla de 21³ y 64 semillas. Todos los cambios conservan líneas visibles: 6474 vértices para hélice y 6804 para rotación. Los recursos se mantienen estables por campo: once geometrías y nueve texturas para hélice; trece geometrías y ocho texturas para rotación. No se detectan errores JavaScript ni pérdida de contexto WebGL. La prueba automatizada acredita esta estabilidad y los límites de vértices; su aprobación no convierte los dos objetivos temporales incumplidos en resultados aprobados.

Informes finales: [performance-summary.json](../evidence/performance-summary.json), [performance-local.json](../evidence/performance-local.json) y [performance-test.json](../evidence/performance-test.json). Los perfiles reproducibles están en [performance-normal.json](../evidence/performance-normal.json) y [performance-maximum.json](../evidence/performance-maximum.json). La medición anterior archivada en `performance-before-readiness-fix.json` quedó invalidada porque el protocolo avanzaba antes de recibir las líneas de la revisión solicitada; no se utiliza para estas conclusiones.

## Reproducción limpia y cierre

Una copia separada del proyecto supera instalación con lockfile congelado, compilación de producción y las 212 pruebas. Registros: [instalación](../evidence/clean-install.log), [compilación](../evidence/clean-build.log), [unitarias](../evidence/clean-unit.log). Sus 107 archivos estáticos coinciden por SHA-256 con la compilación principal: [reproducibility.json](../evidence/reproducibility.json). El paquete incluye fuentes, lockfile, resultado estático, instrucciones, avisos completos de terceros y evidencia. [README.md](../README.md) permite iniciar el resultado compilado con un servidor HTTP local, sin recompilar.

El equipo Windows con i9-13900H y 16 GiB de referencia no está disponible. Los resultados de este Linux con SwiftShader son complementarios; el cierre de Q04 requiere medir el equipo aprobado. La aprobación humana de V05 también continúa pendiente. El estado definitivo de rendimiento y comprobaciones se registra en [STATUS.md](../STATUS.md).
