# Laboratorio de campos vectoriales

Aplicación local para explorar campos estacionarios tridimensionales, inspeccionar sus valores y comparar derivadas y líneas de corriente. La interfaz, la escena y las exportaciones usan exclusivamente negros, blancos y grises neutros.

## Ejecutar

Requisitos: Node.js 24 o posterior, pnpm 11.19.0 y un navegador moderno con WebGL2 para mostrar la escena. La instalación inicial de dependencias necesita conexión.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

Abrir `http://localhost:5173`. Para ejecutar la compilación de producción:

```sh
pnpm build
pnpm preview --port 4173
```

Abrir `http://localhost:4173`. `dist/` contiene el resultado estático; debe servirse mediante HTTP, con sus archivos y workers originales. El servidor local debe permanecer abierto. Las fuentes, KaTeX y las bibliotecas se incluyen en la compilación: la aplicación no utiliza CDN, cuentas ni servicios externos. No incluye instalación como PWA.

El paquete de entrega también incluye `dist/` ya compilado. Extraer el paquete conservando sus carpetas y abrir una terminal en la carpeta que contiene `dist/`. Con Python 3 puede ejecutarse sin instalar dependencias ni recompilar:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Abrir `http://localhost:4173`; en Windows puede usarse `py` en lugar de `python`. No abrir `index.html` directamente.

Este recorrido con la aplicación compilada se comprobó con carga fría, cálculo, exportación PNG y recuperación JSON exacta, sin peticiones externas ni errores: [delivery-smoke.json](evidence/delivery-smoke.json). El ZIP incluye un manifiesto SHA-256 por archivo y se acompaña de `entrega-campo-v1.sha256` para comprobar su integridad.

Sin WebGL2, el editor, la consulta numérica y la recuperación de configuraciones siguen disponibles; la escena y su exportación PNG necesitan un contexto gráfico válido.

## Primer experimento

1. Elegir un campo del catálogo. El estado inicial de escritorio muestra `F = (-y, x, 0)` en `[-3,3]³`, con una malla de `9³` puntos.
2. Editar `P`, `Q` y `R`, y pulsar **Aplicar** o `Ctrl+Enter`. El borrador no sustituye al experimento aplicado. Usar punto decimal y multiplicación explícita, por ejemplo `a*sin(x)`.
3. Abrir el inspector para consultar coordenadas exactas o seleccionar una muestra. Sobre un corte, el clic selecciona un punto del plano; un clic en espacio vacío no inventa una profundidad.
4. Activar líneas de corriente y gestionar sus semillas. Se pueden regenerar 16, 32 o 64 semillas deterministas, añadir el punto inspeccionado, eliminar la última o vaciar la lista.
5. Elegir un corte XY, XZ o YZ y una capa escalar. **Vista perpendicular al corte** facilita la lectura del plano.

En teléfonos, la vista inicial encuadra el corte XY con magnitud; las 16 semillas se conservan y su capa empieza oculta. Los paneles se abren mediante sus botones; la exploración 3D densa se recomienda en escritorio.

La cámara es ortográfica y conserva la misma escala espacial en los tres ejes, con `z` vertical. Arrastrar para orbitar, usar la rueda para ampliar y el botón secundario para desplazar. Con la escena enfocada: cursores para orbitar, `Shift` + cursores para desplazar, `+`/`−` para ampliar y `Home` para encuadrar. Los botones **XY**, **XZ**, **YZ** y **3D** ofrecen vistas directas; **3D** recupera una vista oblicua. `Escape` cierra paneles temporales y devuelve el foco. Restablecer la cámara y restablecer todo el experimento son acciones distintas.

## Leer la escena monocromática

| Información | Representación |
|---|---|
| Campo `F` | Flechas de una punta; longitud proporcional a la magnitud |
| Rotacional `∇×F` | Flechas de doble punta, con escala propia |
| Solo dirección | Longitud uniforme; la leyenda indica que no representa magnitud |
| Flecha saturada | Anillo de limitación; la leyenda cuenta las flechas limitadas |
| Cero de la capa vectorial | Círculo sin dirección; un cero del rotacional no es un equilibrio de `F` |
| Semilla / selección | Cruz / rombo de doble contorno |
| Línea de corriente | Trazo fino y chevrones orientados según `F`; no codifica rapidez |
| Componente perpendicular al corte | `⊙+` hacia el eje positivo y `⊗−` hacia el negativo, independientemente del lado desde el que se mire |
| Magnitud escalar | Gris de oscuro a claro, con escala fija y leyenda numérica |
| Divergencia positiva / negativa | `+` / `−` y tramas diagonales opuestas; el gris representa el valor absoluto |
| Divergencia nula / próxima a cero | `0` para referencia analítica / `≈0` para valor simbólico o numérico con `|∇·F| ≤ 10⁻⁷` |
| No definido / sin muestra / no fiable | Trama cruzada / puntos / trazos, con etiquetas distintas |

La longitud máxima de flecha es `0,8` veces la menor separación de la malla. No se impone una longitud mínima que convierta magnitudes pequeñas en grandes: la leyenda las identifica y el inspector conserva sus componentes. Las escalas permanecen fijas al cambiar de campo; **Ajustar escala a las muestras** realiza un ajuste explícito.

En los cortes se proyecta la capa vectorial elegida. La magnitud escalar sigue siendo la norma tridimensional completa de `F`; divergencia y rotacional siguen siendo operadores tridimensionales. La nulidad de una proyección no implica que el vector original sea nulo.

## Guardar y recuperar

El botón **Archivo** abre el menú para exportar el experimento aplicado como JSON o como PNG de `1600 × 1000` y `2400 × 1500`. El PNG compone la escena, ecuaciones, dominio, escalas, leyendas y ajustes esenciales; restaura la vista después de generar la imagen. Los cambios todavía sin aplicar no se incluyen.

El JSON conserva las componentes, parámetros e intervalos, dominio, resolución, métodos y tolerancias, semillas explícitas, capas, escalas, corte, calidad gráfica, cámara y punto inspeccionado, con precisión de número JavaScript. Importarlo valida primero su estructura y expresiones; un archivo rechazado conserva el experimento anterior. Se admiten `schemaVersion: 1`, `engineVersion: "1.0.0"` y archivos de hasta 1 MiB; no hay migraciones de versiones.

Las configuraciones no guardan el búfer de resultados: se recalculan al recuperarlas. Una ejecución limitada por presupuesto se identifica como parcial y puede incluir menos muestras o líneas.

## Métodos y límites

La documentación matemática está en [docs/MATHEMATICS.md](docs/MATHEMATICS.md). Las cantidades son adimensionales. El programa explora muestras y aproxima curvas; no certifica propiedades globales ni detecta todas las singularidades entre muestras.

Los presupuestos son 2 s para el campo y corte, y 5 s para líneas, con hasta 120 000 vértices, 64 semillas y 1 500 pasos aceptados por sentido y semilla. La malla llega a `21³` y el corte a `129²`. Las expresiones admiten 256 caracteres, 128 nodos y profundidad 24 por componente. Las regiones inválidas, complejas, no finitas, no calculadas y con derivadas no fiables se distinguen de los ceros.

La densidad de muestras, la precisión numérica y la calidad gráfica son ajustes independientes. Los cálculos se realizan en workers; una respuesta de un experimento anterior no reemplaza el resultado actual.

## Comprobar la entrega

```sh
pnpm check
pnpm test
pnpm test:e2e
pnpm build
```

Las pruebas de navegador usan Chromium. En el entorno cloud se verificó Chromium 151.0.7922.173 con WebGL2 mediante ANGLE/SwiftShader. Para usar una instalación distinta, definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE` con la ruta de su ejecutable. En Windows, si no se define esta variable, instalar antes el navegador de Playwright con `pnpm exec playwright install chromium`. Ejemplo en PowerShell con Chrome instalado en su ubicación habitual:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm test:e2e
```

El navegador de pruebas debe tener WebGL2 disponible. Playwright conserva trazas de fallos y escribe el informe de la última ejecución en `evidence/e2e-results.json`. Las 212 pruebas unitarias finales pasan en once archivos. Tras el último cambio se repitieron los 19 flujos de navegador afectados, todos aprobados; la matriz visual conserva sus 78 capturas en seis tamaños. Los recuentos y el alcance de cada ejecución se explican en [docs/VALIDATION-RESULTS.md](docs/VALIDATION-RESULTS.md).

| Evidencia | Archivo |
|---|---|
| Pantalla inicial de escritorio | [Captura](evidence/captures/final-initial-1440x900.png) |
| Hélice, editor e inspector | [Captura](evidence/captures/final-helix-editor-inspector-1440x900.png) |
| Líneas y dirección del campo | [Captura](evidence/captures/final-lines-1440x900.png) |
| Magnitud y proyección XY | [Captura](evidence/captures/final-magnitude-slice-1440x900.png) |
| Divergencia negativa | [Captura](evidence/captures/final-divergence-negative-1440x900.png) |
| Rotacional | [Captura](evidence/captures/final-curl-1440x900.png) |
| Vista inicial de teléfono | [Captura](evidence/captures/final-initial-390x844.png) |
| Zoom nativo del navegador al 200 % | [Captura completa](evidence/captures/h4-native-zoom-200.png) |
| PNG compuesto de 2400 × 1500 | [Exportación](evidence/exports/campo-2400.png) |
| Referencias matemáticas independientes | [Comparaciones](evidence/math-final.json) |
| Errores y convergencia de líneas | [Valores medidos](evidence/streamline-errors.json) |
| Contrastes de la paleta | [Cálculos](evidence/h1-contrast.json) |
| Monocromía de capturas y exportaciones | [Análisis RGB](evidence/palette-final.json) |

La [matriz de revisión visual](docs/VISUAL-REVIEW.md) enlaza las capturas de los seis tamaños y registra qué imágenes se revisaron. El estado final de las comprobaciones, las capturas adicionales y las incidencias se registran en [STATUS.md](STATUS.md) y [PLAN.md](PLAN.md). [SPEC.md](SPEC.md), [DESIGN.md](DESIGN.md) y [VALIDATION.md](VALIDATION.md) conservan los requisitos aprobados.

Para medir la compilación de producción:

```sh
pnpm build && pnpm test:performance
```

El perfil de pruebas utiliza SwiftShader como GPU por software de forma predeterminada. `CAMPO_NATIVE_GPU=1` elimina las opciones que fuerzan SwiftShader y permite medir con la aceleración disponible en el equipo. En PowerShell:

```powershell
$env:CAMPO_NATIVE_GPU = '1'
pnpm build
pnpm test:performance
```

Para Q04 deben registrarse la GPU y el controlador reales, versión del navegador, frecuencia de pantalla y estado de alimentación, además de los resultados; ejecutar el comando no sustituye ese registro. Las mediciones se guardan en `evidence/performance-normal.json`, `evidence/performance-maximum.json`, `evidence/performance-local.json` y `evidence/performance-test.json`.

En la medición final de Linux con SwiftShader, el campo, las líneas y la cancelación cumplen sus objetivos temporales. Los intervalos de fotograma y la respuesta de controles superan sus límites: p95 de 100 ms y 297,7 ms frente a 33,3 ms y 100 ms. El recorrido de 50 cambios conserva líneas, contexto WebGL y recursos estables, sin errores JavaScript. Esa estabilidad aprobada no implica que se cumplan todos los objetivos de rendimiento. Los datos completos y el protocolo están en [docs/VALIDATION-RESULTS.md](docs/VALIDATION-RESULTS.md) y [evidence/performance-summary.json](evidence/performance-summary.json).

Q03 se verificó técnicamente con recorrido de teclado, contraste, análisis axe y zoom nativo del navegador al 200 %. En Chromium con ventana, las teclas reales de zoom redujeron el viewport CSS de 1440 × 900 a 720 × 450 y aumentaron el DPR de 1 a 2. Editor, inspector y ayuda conservaron acceso y retorno de foco, sin desplazamiento horizontal ni errores; el contenido vertical permite desplazarse. La captura completa conserva ese zoom. La matriz de seis tamaños usa además emulación CDP de distribución equivalente; ambos recorridos comprueban movimiento reducido. Evidencia: [evidence/native-zoom.json](evidence/native-zoom.json). Estas comprobaciones no constituyen una certificación exhaustiva de accesibilidad.

Los avisos completos de las bibliotecas y fuentes incluidas están en [docs/THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md).

La revisión visual realizada por agentes no sustituye la aprobación y firma humanas de V05. Las mediciones de este entorno Linux tampoco sustituyen Q04 en el equipo de referencia Windows con i9-13900H y 16 GiB; ambos criterios externos permanecen pendientes hasta disponer de esa evidencia.
