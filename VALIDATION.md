# Pruebas y criterios de aceptación

### 1. Convenciones

Las comparaciones numéricas utilizarán:

\[
|v-v_{\mathrm{ref}}|
\le \mathrm{atol}+\mathrm{rtol}|v_{\mathrm{ref}}|.
\]

Las tolerancias se aplicarán componente por componente. Para posiciones se utilizará distancia euclídea.

Los puntos aleatorios se generarán con semilla fija, y los resultados esperados procederán de fórmulas independientes. Las pruebas no redondearán valores antes de comparar.

### 2. Pruebas matemáticas

| ID | Caso | Criterio |
|---|---|---|
| MAT-01 | Seis campos, 100 puntos interiores y puntos especiales | Componentes, divergencia y rotacional analíticos: `atol=1e-12`, `rtol=1e-12` |
| MAT-02 | Catálogo con diferencias finitas forzadas | `atol=1e-8`, `rtol=1e-8` en el dominio inicial |
| MAT-03 | \(\mathbf F=(\sin x,y^2,xz)\) | Contrastar divergencia \(\cos x+2y+x\) y rotacional \((0,-z,0)\); numérico: `atol=1e-6`, `rtol=1e-5` |
| MAT-04 | \(\mathbf F=(2z,3x,5y)\) | Divergencia 0 y rotacional \((5,2,3)\); detecta permutaciones y signos incorrectos |
| MAT-05 | Equilibrios del catálogo | Sin dirección normalizada ni flechas ficticias en los ceros |
| MAT-06 | Helicoidal con \(a=-1,0,1,2\) | Equilibrios y sentido axial correctos; \(a=0\) coincide con el rotacional |
| MAT-07 | Derivada numérica, pasos \(h,h/2,h/4\) | Descenso del error en un caso suave antes del límite de redondeo; diagnóstico cuando no converge |
| MAT-08 | Cortes y operadores | Coincidencia con evaluación 3D directa en las mismas coordenadas |

Las tolerancias más estrictas del catálogo responden a que sus derivadas son constantes sencillas. Las diferencias finitas tienen margen adicional por cancelación y truncamiento.

No se generalizarán esas tolerancias a cualquier expresión o escala espacial.

### 3. Líneas de corriente

**Campo uniforme.** Con semillas interiores:

- \(y\) y \(z\) permanecen constantes.
- La desviación perpendicular máxima es ≤ \(10^{-10}\ell\).
- Ambos sentidos terminan en las caras correctas de la caja.

**Campo rotacional.** Con semilla \((1,0,0)\):

- Radio constante y \(z=0\).
- Una vuelta completa, con 128 pasos fijos sobre longitud \(2\pi\), presenta error final ≤ \(10^{-6}\).
- No se integra una dirección desde una semilla sobre el eje \(z\).

**Campo helicoidal.** Para semilla \((1,0,0)\):

\[
\mathbf r(s)=
\left(
\cos\frac{s}{\sqrt{1+a^2}},
\sin\frac{s}{\sqrt{1+a^2}},
\frac{as}{\sqrt{1+a^2}}
\right).
\]

Se comprobarán radio, signo vertical y avance \(2\pi a\) por vuelta. Con \(a=1\) y 128 pasos fijos, el error final deberá ser ≤ \(10^{-6}\).

**Convergencia RK4.** Para la hélice con \(a=1\), comparar 32, 64 y 128 pasos sobre una vuelta. El cociente de errores entre refinamientos deberá estar entre 12 y 20, compatible con orden cuatro en este régimen.

Un cálculo preliminar independiente produjo cocientes aproximados de 17,01 y 16,22. Esto fundamenta el criterio; no valida el futuro integrador.

**Modo adaptativo.** En trayectos analíticos acotados:

- Error geométrico máximo ≤ \(10^{-4}\ell\) con los valores predeterminados.
- Reducir las tolerancias no empeora materialmente el error.
- Reducirlas diez veces debe mejorar el resultado mientras el error supere claramente el suelo de redondeo.

**Otros casos.**

- Radiales: trayectoria colineal con la semilla.
- Silla: \(z\) e invariante \(xy\) conservados dentro de tolerancia.
- Sentido de los chevrones correcto en ambas ramas.
- Salidas por frontera, umbral, cierre y recursos registradas por separado.

Las pruebas de convergencia desactivarán el cierre automático para no cambiar el intervalo comparado.

### 4. Expresiones y regiones problemáticas

Se probarán:

- `sin(` como borrador incompleto.
- Variables desconocidas y multiplicación implícita.
- Asignaciones, acceso a propiedades y matrices.
- Expresiones demasiado largas o profundas.
- `1/x` en \(x=0\).
- `sqrt(x)` en puntos negativos y en la frontera de diferenciación.
- `log(x)` fuera de su dominio.
- `exp(1000)` como desbordamiento.
- Campo idénticamente nulo.
- Campo válido solo en parte de la caja.
- Caja sin ninguna muestra válida.
- Semilla en singularidad y semilla fuera de la caja.
- Integración que alcanza una región inválida detectada.

Los resultados inválidos no llegarán a buffers gráficos. No se dibujarán segmentos que unan puntos separados por una muestra inválida conocida.

La documentación explicará que estos casos no demuestran detección exhaustiva de singularidades entre muestras.

### 5. Pruebas funcionales y accesibilidad

- Cambiar de campo y conservar dominio, cámara y escalas.
- Modificar parámetros y recuperar sus valores iniciales.
- Confirmar que editar sin aplicar no cambia el experimento exportado.
- Realizar cambios rápidos y descartar respuestas obsoletas.
- Cambiar densidad sin alterar resultados del inspector.
- Cambiar escala gráfica sin alterar valores matemáticos.
- Comparar corte, escena, ecuaciones, leyendas e inspector.
- Restablecer cámara y experimento con efectos distintos.
- Exportar/importar configuraciones y comparar su estado completo.
- Rechazar un archivo incorrecto sin perder el experimento.
- Exportar PNG con leyendas y sin recortes.
- Recorrer todos los controles con teclado.
- Verificar foco visible y retorno del foco.
- Comprobar textos accesibles del inspector y errores.
- Revisar zoom del navegador al 200 % y movimiento reducido.
- Simular ausencia o pérdida de contexto WebGL.

Si WebGL no está disponible, la aplicación conservará el editor, los diagnósticos textuales y la importación/exportación de configuraciones; explicará por qué no puede mostrar la escena.

### 6. Revisión visual

Capturas obligatorias:

- 1920 × 1080.
- 1440 × 900.
- 1280 × 720.
- 1024 × 768.
- 768 × 1024.
- 390 × 844.

Escenarios mínimos:

1. Pantalla inicial.
2. Editor, parámetros e inspector.
3. Líneas de corriente.
4. Magnitud en corte.
5. Divergencia positiva, negativa y nula.
6. Rotacional.
7. Expresión inválida y campo parcialmente definido.
8. Densidad máxima.
9. Menú, ayuda y foco de teclado.
10. Movimiento reducido y zoom al 200 %.

Lista de aceptación:

- Paleta neutra en interfaz, escena e imágenes exportadas.
- Tipografía consistente, sin valores numéricos que salten de posición.
- Contraste de textos, controles y glifos.
- Alineación y espaciado conforme a tokens.
- Leyendas asociadas a sus capas.
- Signos, selección y errores reconocibles sin depender del gris.
- Flechas distinguibles del fondo.
- Saturación de magnitudes visible y explicada.
- Paneles sin densidad excesiva.
- Ausencia de recortes y superposiciones.
- Sin desplazamiento horizontal de toda la página.
- Desplazamiento vertical limitado a los paneles que lo necesitan.

Las capturas se producirán con cámara, semillas y estado fijados, fuentes cargadas y animaciones desactivadas. La comparación visual se hará en el mismo navegador y entorno, como recomienda la documentación de [Playwright](https://playwright.dev/docs/test-snapshots).

No se exigirá identidad píxel a píxel entre GPU diferentes. Las diferencias deberán revisarse, y nunca se aprobará una referencia automáticamente para ocultar un fallo.

### 7. Rendimiento

**Equipo de referencia:** el Windows inspeccionado, i9-13900H y 16 GiB. Antes de medir se registrarán GPU, controlador, aceleración disponible, navegador exacto, frecuencia de pantalla y estado de alimentación.

**Configuración:**

- Compilación de producción.
- Chrome, 1440 × 900, relación de píxeles 1.
- Equipo conectado a corriente.
- Sin herramientas de desarrollo abiertas ni tareas intensivas simultáneas.
- Diez segundos de calentamiento.
- Cinco repeticiones de 30 segundos con el mismo recorrido de cámara.
- Tiempos de cálculo separados del tiempo de renderizado.

**Perfil normal:**

- Campo helicoidal, \(a=1\).
- Dominio \([-3,3]^3\).
- Malla \(17^3=4913\) muestras.
- 32 semillas deterministas.
- Corte \(65^2\).
- Líneas con ajustes predeterminados.

Objetivos:

- Percentil 95 del intervalo entre fotogramas ≤ 33,3 ms durante la órbita.
- Respuesta visible de controles ≤ 100 ms.
- Actualización del campo, sin líneas, ≤ 500 ms en percentil 95.
- Recálculo de líneas ≤ 2 s en percentil 95.
- Cancelación atendida en ≤ 100 ms cuando el worker está procesando bloques.

**Perfil máximo:**

- Malla \(21^3\), 64 semillas y hasta 120 000 vértices.
- La interfaz permanece operable.
- Los presupuestos detienen o limitan el trabajo con diagnóstico.
- No hay pérdida de contexto ni crecimiento sostenido de recursos tras 50 cambios de experimento.

Se registrarán medianas, percentiles, muestras descartadas y motivos. Estos son objetivos de aceptación pendientes de medición, no resultados ya obtenidos.

