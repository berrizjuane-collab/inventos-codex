# Arquitectura, métodos e hitos

### 1. Entorno y tecnologías

La implementación usa el checkout `/workspace/inventos-codex` en Linux x86_64, Node.js 24.19.0, pnpm 11.19.0 y Chromium 151.0.7922.173. Hay aproximadamente 33 GiB disponibles. Las versiones exactas de las bibliotecas están fijadas en `package.json` y `pnpm-lock.yaml`.

El documento aprobado describía Windows x64, i9-13900H y 16 GiB. Ese equipo se conserva como referencia de rendimiento de VALIDATION; las mediciones Linux no lo sustituyen. WebGL/GPU se registrarán en las evidencias de navegador.

Arquitectura propuesta: aplicación estática, ejecutada íntegramente en el navegador.

| Tecnología | Uso y justificación |
|---|---|
| React + TypeScript | Formularios, paneles y contratos tipados; estado del experimento coordinado mediante hooks y workers |
| Vite | Desarrollo local y empaquetado estático; el Node instalado cumple los requisitos documentados |
| Three.js directo | Escena y recursos gráficos bajo un ciclo de vida explícito |
| mathjs | Análisis de expresiones y derivadas simbólicas, con un subconjunto propio estrictamente validado |
| Dos Web Workers | Separar evaluación/derivadas de integración de líneas |
| KaTeX | Ecuaciones legibles con salida HTML y MathML |
| Zod | Validación de configuraciones importadas |
| Vitest | Pruebas matemáticas y de estado |
| Playwright | Flujos, capturas y mediciones reproducibles |
| CSS y controles semánticos | Sistema visual propio; sin incorporar un sistema completo de componentes |

Three.js documenta que `WebGLRenderer` requiere WebGL 2 y que `InstancedMesh` permite reducir llamadas de dibujo al repetir geometrías. Se utilizarán instancias para las flechas. Las líneas usarán los complementos de grosor configurable. Fuentes: [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) y [Line2](https://threejs.org/docs/pages/Line2.html).

La integración React–Three se encapsulará en un componente con inicialización, actualización y liberación de recursos, siguiendo el patrón de sincronización con sistemas externos de [React](https://react.dev/reference/react/useEffect).

Las versiones exactas se fijarán al iniciar la implementación y quedarán en el archivo de bloqueo. No se utilizarán dependencias flotantes en la entrega reproducible.

### 2. Separación de responsabilidades

La estructura tendrá módulos por responsabilidad:

| Módulo | Responsabilidad |
|---|---|
| `math` | Catálogo, gramática, evaluación, dominio natural y derivadas |
| `numerics` | Muestreo, diferencias finitas, RK4 y criterios de parada |
| `workers` | Ejecución, presupuestos, cancelación y transferencia de resultados |
| `experiment` | Estado aplicado, borradores, revisiones, restablecimiento y esquema |
| `scene` | Cámara, flechas, líneas, planos, selección y liberación de GPU |
| `ui` | Editor, controles, inspector, leyendas, ayuda y accesibilidad |
| `exports` | PNG, JSON y recuperación |
| `tests` | Referencias matemáticas, escenarios, capturas y rendimiento |
| `docs` | Los cinco documentos de este plan |

El motor matemático no importará React ni Three.js. La escena recibirá datos calculados; no interpretará expresiones.

**Flujo de datos:**

`borrador → validación → solicitud con revisión → cálculo → resultado validado → estado aplicado → escena e inspector`

Los resultados de revisiones antiguas se descartarán. Cambiar la cámara no recalculará el campo.

### 3. Contratos internos y configuración

No habrá API de servidor en la versión inicial.

Los contratos mínimos serán:

- `FieldDefinition`: identificador, componentes, parámetros y referencias analíticas opcionales.
- `ExperimentConfigV1`: estado reproducible del experimento.
- `EvaluationResult`: vector y norma, o causa explícita de invalidez.
- `DerivativeResult`: jacobiano, divergencia, rotacional, método y diagnóstico.
- `StreamlineResult`: posiciones, semilla, sentidos integrados y motivo de parada.
- `ComputeRequest/ComputeResponse`: tipo de operación, revisión, datos y estado.

Los cálculos utilizarán números de doble precisión. La conversión a buffers de GPU no modificará los valores conservados para el inspector.

La configuración JSON incluirá:

- `schemaVersion: 1` y versión del motor.
- Ecuaciones y parámetros con sus intervalos.
- Dominio y resolución.
- Método y ajustes numéricos.
- Semillas explícitas.
- Capas, corte y escalas.
- Cámara y punto inspeccionado.

No contendrá código compilado, árboles internos de mathjs ni geometría derivada.

El importador rechazará versiones incompatibles, estructuras desconocidas, números no finitos y recursos por encima de los límites. Volverá a analizar las expresiones. En v1 no habrá migraciones.

### 4. Evaluación y derivación

**Expresiones.**

1. Analizar el texto.
2. Validar todos los nodos contra la gramática permitida.
3. Rechazar símbolos y operaciones ajenos al subconjunto.
4. Compilar una vez por cambio de expresión.
5. Evaluar con un ámbito `Map` que solo contenga variables y parámetros autorizados.
6. Admitir únicamente resultados escalares reales finitos.

El editor no usará `eval` ni `new Function`. mathjs documenta tanto el análisis en árboles como los riesgos de expresiones costosas y su aislamiento en workers; la lista permitida y los límites serán adicionales a la biblioteca. Véanse [seguridad](https://mathjs.org/docs/expressions/security.html) y [análisis de expresiones](https://mathjs.org/docs/expressions/parsing.html).

**Derivadas.**

- Catálogo: referencias analíticas explícitas.
- Expresiones personalizadas: intentar derivar las nueve entradas del jacobiano.
- Usar inicialmente derivación sin simplificación para reducir eliminaciones inadvertidas de restricciones del dominio.
- Limitar cada árbol derivado a 512 nodos.
- Si una derivada no puede prepararse dentro del presupuesto, recurrir a diferencias finitas.
- Ofrecer **Automático** y **Diferencias finitas** para estudiar el error numérico.
- Evaluar primero el campo original: una simplificación derivada no validará un punto donde el campo original esté indefinido.

La API oficial admite derivadas parciales y la opción de desactivar simplificación: [mathjs derivative](https://mathjs.org/docs/reference/functions/derivative.html).

Para una componente \(f\):

\[
D_j(h)=\frac{f(\mathbf x+h\mathbf e_j)-f(\mathbf x-h\mathbf e_j)}{2h}.
\]

Con \(L_j\) igual al ancho del dominio en ese eje:

\[
h_j=\eta\max(1,|x_j|,L_j),\qquad \eta=10^{-4}.
\]

Se calcularán \(D_j(h_j)\) y \(D_j(h_j/2)\). Se devolverá el segundo y se estimará:

\[
E_j=\frac{|D_j(h_j/2)-D_j(h_j)|}{3}.
\]

Para la comprobación local se usará:

\[
T_j=10^{-7}\max(1,A_j/L_j)+10^{-4}|D_j(h_j/2)|,
\]

donde \(A_j\) es la máxima magnitud de la componente en el stencil utilizado.

Si \(E_j>T_j\), se permitirán hasta tres reducciones adicionales. Si continúa sin converger, la derivada se marcará como no fiable.

Los puntos del stencil podrán quedar fuera de la caja visual si pertenecen al dominio natural. Si faltan valores reales finitos, no se sustituirán silenciosamente por diferencias unilaterales.

Este control estima error local; no demuestra diferenciabilidad.

### 5. Muestreo e integración

**Muestreo.**

- Malla cartesiana regular, incluyendo extremos.
- Resoluciones impares para incluir el centro.
- Evaluación puntual directa en el inspector, independiente de la malla.
- Máscara de validez y conteos de ceros, valores omitidos y saturación.
- Resolución de corte independiente de la malla 3D.
- Sin interpolación a través de muestras inválidas.

**Semillas.**

Las 16 semillas iniciales se generarán de forma determinista con una secuencia Halton de bases 2, 3 y 5, dentro del 80 % central de la caja. Después se conservarán como coordenadas explícitas.

Al cambiar el dominio, las semillas exteriores quedarán inactivas y se notificará su número. Regenerarlas será una acción explícita.

**RK4.**

Se implementará RK4 clásico con:

- Modo adaptativo predeterminado.
- Modo de paso fijo para experimentos de convergencia.
- Integración hacia ambos sentidos.
- Comparación de un paso completo con dos medios pasos.
- Error local estimado como la diferencia entre ambos resultados dividida entre 15.
- Aceptación del resultado de los dos medios pasos.

Sea \(\ell\) la diagonal de la caja:

| Ajuste | Valor inicial |
|---|---:|
| Paso inicial | \(0,01\ell\) |
| Paso mínimo | \(10^{-6}\ell\) |
| Paso máximo | \(0,025\ell\) |
| Tolerancia absoluta | \(10^{-6}\ell\) |
| Tolerancia relativa | \(10^{-5}\) |
| Umbral de magnitud para detener normalización | \(10^{-10}\) |
| Longitud máxima por sentido | \(8\ell\) |

La aceptación utilizará:

\[
E\le \mathrm{atol}+\mathrm{rtol}\,h.
\]

La adaptación del paso aplicará un factor de seguridad 0,9, exponente \(1/5\) y factor de cambio limitado entre 0,2 y 2.

**Paradas obligatorias:**

- Salida del dominio de visualización.
- Campo no definido o no finito en una etapa.
- Magnitud por debajo del umbral.
- Paso mínimo sin satisfacer tolerancia.
- Longitud o número máximo de pasos.
- Presupuesto global de vértices o tiempo.
- Cancelación por un experimento nuevo.
- Cierre aproximado de una curva.

La salida por frontera se refinará reduciendo el último paso. No se dibujarán segmentos que prolonguen una solución fuera de la caja.

Un cierre aproximado exigirá proximidad al inicio, tangentes compatibles y al menos 20 pasos. Se identificará como aproximado y se evitará representar dos veces el mismo circuito generado desde una semilla.

Las marcas sobre las líneas seguirán el sentido del campo incluso en la rama calculada hacia atrás.

### 6. Recursos y fluidez

- Dos workers como máximo: evaluación/derivadas y líneas.
- Trabajos divididos en bloques con cesión de ejecución y comprobación de cancelación.
- Presupuesto de 2 s para cálculo de campo y derivadas de una revisión.
- Presupuesto de 5 s para una solicitud de líneas.
- Un worker que deje de responder se terminará y recreará; la escena válida se conservará.
- Derivación simbólica con vigilancia de tiempo; al exceder su presupuesto, reintento numérico.
- Buffers transferibles para reducir copias.
- Flechas instanciadas y geometrías reutilizadas.
- Liberación explícita de materiales, geometrías y renderizadores sustituidos.
- Renderizado bajo demanda; sin bucle continuo cuando la escena está quieta.
- Relación de píxeles limitada a 1,5 por defecto.
- Sin reducción silenciosa de tolerancias para mejorar FPS.

Se distinguirán tres controles: **precisión numérica**, **resolución de muestreo** y **calidad gráfica**. Aumentar uno no se presentará como mejora de los otros.

Vite documenta el empaquetado de workers con módulos: [Web Workers](https://vite.dev/guide/features.html#web-workers).

### 7. Exportaciones y ejecución local

**PNG.** Exportará la escena con fondo, ecuaciones aplicadas, dominio, leyendas, escalas y ajustes esenciales. Se ofrecerán 1600 × 1000 y 2400 × 1500. La cámara conservará su orientación y el encuadre se adaptará al formato.

Se renderizará temporalmente a la resolución de salida y se compondrán los textos; no será una captura indiscriminada de toda la interfaz. Se restaurará el estado gráfico después de exportar.

**JSON.** Exportará el estado aplicado con precisión numérica completa. La reimportación deberá reproducir sus resultados dentro de las tolerancias establecidas.

**Ejecución prevista:**

```text
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1
pnpm test
pnpm exec playwright test
pnpm build
pnpm preview --host 127.0.0.1
```

La primera instalación y la descarga de navegadores de prueba necesitarán conexión. Después, el desarrollo y la aplicación servida localmente funcionarán sin servicios externos, CDN ni fuentes remotas.

Se utilizará HTTP local; abrir directamente el archivo mediante `file://` no será un modo soportado. La documentación oficial cubre los requisitos y comandos de [Vite](https://vite.dev/guide/).

### 8. Hitos y checklist ejecutable

Los checks siguientes reflejan el avance verificado. Cada cierre exige evidencia, además del código.

#### H0 — Base reproducible

- [x] **P01 — Materializar documentación.**  
  **Dependencias:** aprobación del plan. **Componentes:** documentación. **Procedimiento:** guardar los cinco documentos y registrar decisiones y alcance. **Aceptación:** documentos consistentes y tareas identificables. **Verificación:** revisión cruzada. **Evidencia:** documentos versionados y registro de revisión.

- [x] **A01 — Preparar el proyecto.**  
  **Dependencias:** P01. **Componentes:** herramientas y estructura. **Procedimiento:** crear proyecto React/TypeScript/Vite, fijar dependencias y configurar Vitest y Playwright. **Aceptación:** desarrollo, compilación y una prueba mínima funcionan. **Verificación:** ejecutar los comandos documentados. **Evidencia:** versiones y salidas de comandos.

#### H1 — Primera escena y dirección visual

- [x] **V01 — Sistema visual.**  
  **Dependencias:** A01. **Componentes:** estilos, fuentes e iconografía. **Procedimiento:** implementar tokens, tipografía, espaciado y estados básicos. **Aceptación:** todos los colores son neutros y los contrastes cumplen los objetivos. **Verificación:** inspección de estilos y cálculo de contraste. **Evidencia:** ficha de tokens y captura de componentes.

- [x] **V02 — Composición principal.**  
  **Dependencias:** V01. **Componentes:** estructura de pantalla. **Procedimiento:** construir barra, panel, escena, leyenda e inspector. **Aceptación:** escena protagonista y ausencia de solapamientos a 1440 × 900 y 1280 × 720. **Verificación:** capturas y medición de áreas. **Evidencia:** ambas capturas anotadas.

- [x] **M01 — Catálogo analítico.**  
  **Dependencias:** A01. **Componentes:** catálogo y referencias. **Procedimiento:** definir los seis campos y sus propiedades analíticas independientes. **Aceptación:** ecuaciones, parámetros y equilibrios coinciden con SPEC. **Verificación:** valores en puntos conocidos y revisión matemática. **Evidencia:** tabla de resultados.

- [x] **R01 — Conectar la primera escena.**  
  **Dependencias:** V02, M01. **Componentes:** muestreo básico, escena y cámara. **Procedimiento:** representar el campo rotacional con malla \(9^3\), flechas instanciadas, ejes etiquetados y escala. **Aceptación:** cámara operable y sentido correcto de los vectores. **Verificación:** comparar puntos de los ejes y una captura. **Evidencia:** captura y registro de comprobación.

- [x] **Q01 — Revisar el primer hito.**  
  **Dependencias:** R01. **Componentes:** integración inicial. **Procedimiento:** comprobar arranque, redimensionado, cámara y lenguaje visual. **Aceptación:** primer recorrido sin errores bloqueantes. **Verificación:** sesión guiada reproducible. **Evidencia:** captura del hito y lista de incidencias resueltas.

#### H2 — Edición y análisis puntual

- [x] **M02 — Editor matemático seguro.**  
  **Dependencias:** M01. **Componentes:** parser y evaluación. **Procedimiento:** implementar gramática, límites, compilación y errores por componente. **Aceptación:** acepta el subconjunto y rechaza construcciones ajenas. **Verificación:** casos válidos, inválidos y costosos. **Evidencia:** informe automatizado.

- [x] **C01 — Estado y cálculo concurrente.**  
  **Dependencias:** M02, R01. **Componentes:** estado, workers y muestreo. **Procedimiento:** incorporar revisiones, cancelación, máscaras de validez y publicación coherente. **Aceptación:** nunca aparece un resultado antiguo como actual. **Verificación:** cambios rápidos y respuestas deliberadamente retrasadas. **Evidencia:** trazas de revisiones y prueba funcional.

- [x] **V03 — Controles y estados de interacción.**  
  **Dependencias:** V02, C01. **Componentes:** formularios y paneles. **Procedimiento:** conectar ejemplos, componentes, parámetros, dominio, densidad y restablecimiento. **Aceptación:** todos los flujos de SPEC funcionan y conservan borradores. **Verificación:** teclado, ratón y entradas parciales. **Evidencia:** capturas de estados y reporte de flujos.

- [x] **M03 — Derivadas y diagnósticos.**  
  **Dependencias:** M02, C01. **Componentes:** jacobiano y operadores. **Procedimiento:** implementar derivación simbólica, alternativa numérica y estimación de error. **Aceptación:** catálogo y campos de referencia superan tolerancias. **Verificación:** pruebas analíticas y reducción de paso. **Evidencia:** errores por componente y método.

- [x] **U01 — Inspector avanzado.**  
  **Dependencias:** V03, M03. **Componentes:** selección e inspector. **Procedimiento:** admitir coordenadas exactas, selección de muestras y tabla desplegable del jacobiano. **Aceptación:** valores originales y diagnósticos coinciden con la revisión aplicada. **Verificación:** puntos conocidos y puntos indefinidos. **Evidencia:** capturas y resultados esperados/obtenidos.

#### H3 — Líneas, cortes y legibilidad científica

- [x] **N01 — Integración de líneas.**  
  **Dependencias:** M02, C01. **Componentes:** RK4 y worker de líneas. **Procedimiento:** implementar pasos fijo/adaptativo, ambos sentidos y paradas. **Aceptación:** rectas, círculos y hélices cumplen VALIDATION. **Verificación:** geometría analítica y convergencia. **Evidencia:** tabla de errores y motivos de parada.

- [x] **R02 — Semillas y representación de líneas.**  
  **Dependencias:** N01, V03. **Componentes:** escena y controles de semillas. **Procedimiento:** conectar semillas deterministas, edición y marcas de dirección. **Aceptación:** regeneración reproducible, direcciones correctas y cancelación efectiva. **Verificación:** escenarios guardados y revisión visual. **Evidencia:** configuraciones y capturas.

- [x] **R03 — Cortes y capas de análisis.**  
  **Dependencias:** M03, U01. **Componentes:** planos, magnitud, divergencia y rotacional. **Procedimiento:** implementar un corte activo, proyecciones y selección de capas. **Aceptación:** operadores 3D correctos y componente perpendicular identificada. **Verificación:** puntos compartidos entre corte e inspector. **Evidencia:** capturas XY/XZ/YZ y comparación numérica.

- [x] **V04 — Legibilidad científica monocromática.**  
  **Dependencias:** R02, R03. **Componentes:** glifos, tramas, escalas y leyendas. **Procedimiento:** integrar las reglas de DESIGN y resolver saturación, signos y valores inválidos. **Aceptación:** ninguna información esencial depende únicamente del gris. **Verificación:** revisión de todas las capas a densidad normal y máxima. **Evidencia:** matriz de codificación y capturas anotadas.

#### H4 — Recuperación y cierre de calidad

- [x] **E01 — Exportar y recuperar.**  
  **Dependencias:** V04, U01. **Componentes:** PNG, JSON y esquema. **Procedimiento:** implementar composición de imagen, serialización e importación transaccional. **Aceptación:** imágenes completas y recuperación numéricamente equivalente. **Verificación:** ida y vuelta, archivos corruptos y versiones incompatibles. **Evidencia:** PNG, JSON y reporte de comparación.

- [x] **Q02 — Regresión matemática.**  
  **Dependencias:** M03, N01, R03. **Componentes:** pruebas matemáticas. **Procedimiento:** ejecutar la matriz completa de VALIDATION con semillas fijas. **Aceptación:** todas las tolerancias satisfechas. **Verificación:** suite automatizada. **Evidencia:** informe con errores máximos y versiones.

- [x] **Q03 — Flujos y accesibilidad.**  
  **Dependencias:** V03, U01, E01. **Componentes:** interfaz completa. **Procedimiento:** recorrer todos los flujos, teclado, foco, zoom y estados de fallo. **Aceptación:** sin bloqueos, pérdida indebida de estado ni controles inaccesibles. **Verificación:** pruebas automatizadas y revisión manual. **Evidencia:** reporte, capturas y observaciones de accesibilidad.

- [ ] **V05 — Revisión visual por capturas.**  
  **Dependencias:** V04, E01, Q03. **Componentes:** presentación completa. **Procedimiento:** capturar tamaños y estados definidos, corregir desviaciones y repetir solo los casos afectados. **Aceptación:** cumple la lista visual completa. **Verificación:** comparación y revisión humana. **Evidencia:** capturas aprobadas y lista firmada de comprobaciones.
  **Estado parcial:** 78 capturas, capturas complementarias y revisión técnica completadas; falta la aprobación visual humana y su lista firmada. Se cierra cuando una persona revise y firme la lista de `docs/VISUAL-REVIEW.md`.

- [ ] **Q04 — Rendimiento reproducible.**  
  **Dependencias:** V04, E01. **Componentes:** workers, render y memoria. **Procedimiento:** ejecutar perfiles normal y máximo en el equipo registrado. **Aceptación:** objetivos de fluidez, latencia y estabilidad satisfechos. **Verificación:** mediciones repetidas sobre compilación de producción. **Evidencia:** configuración, tiempos, hardware y trazas.
  **Estado parcial:** ensayo Linux/SwiftShader completo y reproducible; cálculo y estabilidad superan sus objetivos, pero fotogramas y controles incumplen sus tiempos. El Windows i9-13900H/16 GiB aprobado no está disponible. Se necesita ejecutar el protocolo en ese equipo y corregir los incumplimientos que persistan antes de cerrar el check.

- [ ] **D01 — Entrega documentada.**  
  **Dependencias:** Q02, Q03, V05, Q04. **Componentes:** aplicación y documentación. **Procedimiento:** actualizar instrucciones, limitaciones, evidencias y STATUS. **Aceptación:** una ejecución limpia reproduce la entrega. **Verificación:** recorrido desde instalación hasta recuperación de un experimento. **Evidencia:** registro final y paquete entregable.
  **Estado parcial:** aplicación compilada, código, instrucciones, documentación matemática, evidencias y paquete con manifiesto SHA-256 preparados. La instalación/build limpios y recuperación están verificados. El cierre formal mantiene sus dependencias V05 y Q04 abiertas, sin impedir la entrega ejecutable.

Una tarea en curso conservará `[ ]` y añadirá una nota. Una tarea bloqueada indicará causa, impacto y condición de desbloqueo. Solo se marcará `[x]` después de superar su verificación.


## Registro de cambios al plan

- 2026-10-02: aprobación recibida en la solicitud actual. Los cinco documentos se extrajeron del adjunto sin reducir el alcance. Revisión cruzada independiente de contratos: no hay contradicciones bloqueantes.
- Entorno real actualizado a Linux/Chromium; Q04 del equipo Windows permanece sujeto a comprobación externa.
- La revisión visual realizada por agentes se distinguirá de una aprobación humana; no se inventará firma externa para V05.
- P01: evidencia en los cinco documentos de la raíz; decisiones y revisión registradas aquí.

- A01: `pnpm install --frozen-lockfile`, `pnpm build`, 1 prueba unitaria y 1 prueba Playwright pasaron. Informes en `evidence/h0-unit.json` y `evidence/e2e-results.json`. Caché pnpm redirigida al directorio padre writable mediante `.npmrc`.

- H1: catálogo 16/16 pruebas (`evidence/h1-math.json`), navegador correcto y capturas 1440×900/1280×720 (`evidence/captures/h1-*`). Contrastes en `evidence/h1-contrast.json`; WebGL2 SwiftShader en `evidence/h1-browser.json`. Revisión del agente: puntas y ejes inicialmente pequeños, corregidos y capturados de nuevo; malla 9³, cámara y leyenda verificadas.

- H2: gramática, estados inválidos, derivadas y guardas probados (`evidence/h2-unit.json`, >97 tests). Cuatro flujos Playwright ejecutados con éxito (tests/e2e/h2.spec.ts): borrador/operadores/inspector, respuesta antigua retrasada, singularidades y parámetro vacío. Capturas `h2-inspector.png`, `h2-no-definido.png` revisadas por agente. Corregidos inspector antiguo, metadata de parámetros, entradas vacías, -0 textual y advertencias emoji coloreadas. LaTeX se genera desde AST validado en worker.

- H3: 137/137 pruebas unitarias, cuatro flujos de navegador y capturas de líneas/cortes/signos/rotacional/densidad21. Evidencias `evidence/h3-unit.json`, `evidence/streamline-errors.json`, `tests/e2e/h3.spec.ts` y `evidence/captures/h3-*`. Corregidos proyección frente a norma3D en leyendas, normas extremas/subnormales, ceros sobre fondo claro y símbolos perpendiculares que tapaban flechas.
- H4: al cambiar dominio, la posición del corte se ajusta al nuevo intervalo; las semillas exteriores se conservan. Se añade aviso para orden inválido de pasos, sin aplicarlo.

- H4, rendimiento: sustituido el descanso cooperativo con temporizadores anidados por tareas MessageChannel, manteniendo bloques de ≤16 ms y guardas de revisión. Chromium añadía ~4 ms por pausa y ralentizaba innecesariamente las mallas. Se repiten regresión y producción tras el cambio.

- H4, revisión visual: importación ya no fuerza indicador 3D; el preset activo se deriva de la orientación real y una cámara libre no marca un preset. Diagnósticos de sintaxis traducidos al español y estado de importación sin anunciar cálculo terminado como pendiente.
- Se reserva una franja de 40 px para instrucciones de cámara en escritorio; no invade el volumen dibujado. Las capturas de cortes usan la acción perpendicular de encuadre sin alterar la política de recuperación exacta.
- La captura de Playwright restituía el viewport antes de guardar el zoom simulado. Se corrige usando Page.captureScreenshot de CDP y se comprueban CSSviewport/DPR después de capturar. El zoom nativo quedó pendiente en ese ensayo; se resuelve posteriormente en el cierre Q03 registrado abajo.

- H4, móvil: encuadre inicial XY explícito, capa de semillas inicialmente oculta sin modificar sus coordenadas ni cálculos; badge de densidad en fila reservada y encabezados apilados bajo 360 px CSS. Estado inferior de 32 px con texto completo accesible y elipsis visual.
- H4, subnormales: dirección normalizada tras escalar por el componente absoluto mayor, para no perder orientación por redondeo de la norma subnormal. Evidencia adicional en glyphs y flujo de magnitudes extremas.

- H4, precisión gráfica: coordenadas GPU relativas al centro del dominio antes de convertir a Float32; cálculo, cámara, selección e intercambio siguen en coordenadas globales Float64. Evita colapsar una malla de 21 puntos de ancho 0,001 situada cerca de ±10000; pruebas geométricas, picking y comparación renderizada.
- H4, controles: mínimos de 40 px para botones de vista, sliders y etiquetas de checkbox; 44 px en móvil o puntero táctil. Tolerancia de orientación1e-5 para reconocer vistas perpendiculares tras la protección polar de OrbitControls (~1e-6rad). Sin alterar la cámara exportada.

- H4, etiquetas del dominio desplazado: las marcas de coordenadas de escena pasan de 4 a 12 cifras significativas para distinguir posiciones próximas a 10000. El inspector y JSON conservan el valor doble original.

- E01 verificado: seis flujos de `tests/e2e/h4.spec.ts`, 50 pruebas de esquema y 9 de metadatos PNG; ida y vuelta completa, rechazo transaccional y exportaciones1600×1000/2400×1500. Evidencia `evidence/exports/`, recuperación exacta de cámara y prueba del dominio desplazado.
- Q02 verificado: suite inicialmente de 207 pruebas y ampliada a 212/212 con la regresión de estado pendiente (`evidence/h4-unit.json`, réplica limpia `evidence/clean-unit.log`); 16 casos/2000 muestras/34000 comparaciones con cero fallos (`evidence/math-final.json`). Errores geométricos y convergencia RK4 en `evidence/streamline-errors.json`.

- H4, protocolo de rendimiento: se descarta el ensayo que podía avanzar durante el cálculo de líneas por esperar cualquier revisión estable. El nuevo protocolo compara claves matemáticas y de líneas de la configuración solicitada, comprueba el estado de nuevo tras dibujar y exige vértices de líneas en cada perfil. `performance-before-readiness-fix.json` identifica el ensayo inválido; no se utiliza para aceptación.
- Configuración cloud: script de instalación y arranque guardados como borrador, sin cambiar red ni secretos. `scripts/cloud-setup.sh` se ejecutó correctamente (`evidence/cloud-setup.log`). La restauración desde un entorno nuevo sigue sin comprobar; el repositorio todavía tiene HEAD sin primer commit.

- H4, estado pendiente: se deriva inmediatamente del campo solicitado antes de ejecutar efectos React. Cinco regresiones del hook confirman que la revisión anterior permanece aplicada y no habilita exportación prematuramente; conservan cámaras/gráficos instantáneos, descarte de respuestas antiguas y recuperación de fallos. Se verifican flujos afectados sin repetir la matriz visual estable.

- Cierre de regresión: 212/212 pruebas unitarias en 11 archivos y 19/19 flujos afectados en 116,17 s después de la última corrección. La ejecución previa de 96/96 y sus 78 capturas se conservan mediante `evidence/e2e-regression-96-summary.json`, que declara su procedencia de registro resumido; no se presenta como el informe JSON íntegro de esa ejecución. La última corrección solo modifica el estado pendiente y no la composición ni la geometría.
- Q03 cerrado con evidencia: teclado, foco, errores de WebGL, uso después de cargar sin red, exportación y recuperación. Zoom nativo 200 % mediante teclas reales en Chromium con Xorg: viewport CSS 1440×900 → 720×450, DPR 1 → 2 y ventana física constante; captura CDP completa de 1440×900 sin alterar zoom. Movimiento reducido emulado como preferencia de medios. Informe `evidence/native-zoom.json` y captura revisados técnicamente por dos agentes.
- Revisión monocromática final: 85 imágenes, 95 103 912 píxeles RGB y cero píxeles no neutros (`evidence/palette-final.json`). No cambia la dirección visual aprobada.
- Q04, medición válida final: cinco órbitas de 30 s sobre producción, con líneas de la revisión solicitada presentes. Mediana/p95 en ms: fotograma 66,6/100,0 y control 227,4/297,7 (incumplen); campo 79,5/99,8 y líneas 78,7/108,8 (cumplen). Cincuenta cambios a 21³/64 semillas sin errores ni pérdida WebGL y recursos estables. Se conserva pendiente la aceptación en el equipo Windows aprobado.
- Entrega v1: compilación repetida en copia limpia con 107 archivos idénticos por SHA-256, avisos de terceros incluidos y ZIP con código, aplicación compilada, documentación y evidencias. No se reducen criterios ni se atribuye aprobación humana o rendimiento de GPU física al resultado Linux.
- Ejecución de entrega verificada sirviendo exclusivamente `dist/` con Python HTTP: carga fría, worker, exportación PNG y recuperación JSON exacta, 14 peticiones locales correctas y cero errores (`evidence/delivery-smoke.json`). La espera exige el campo aplicado solicitado y el fin de cálculo; no acepta una revisión estable anterior durante la importación.
