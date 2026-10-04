# Matemática y representación

## Campo, dominio y precisión

Se explora un campo estacionario adimensional

\[
\mathbf F(x,y,z)=(P(x,y,z),Q(x,y,z),R(x,y,z)).
\]

Las coordenadas son cartesianas dextrógiras, con `z` vertical. La caja de visualización

\[
B=[x_{\min},x_{\max}]\times[y_{\min},y_{\max}]\times[z_{\min},z_{\max}]
\]

no es una frontera física. El dominio natural \(\Omega\) contiene los puntos donde las tres expresiones producen escalares reales finitos; la región explorada es \(B\cap\Omega\). La caja predeterminada es \([-3,3]^3\).

Evaluaciones, operadores y vértices calculados utilizan números IEEE 754 de doble precisión. La escena resta el centro de la caja en doble precisión antes de construir posiciones y matrices Float32 para la GPU. La traslación global y la cámara se componen en la CPU; las coordenadas de cálculo, selección, rayos y JSON permanecen globales. Esta separación conserva las 21 posiciones de una malla de ancho 0,001 próxima a ±10000, donde coordenadas Float32 absolutas solo conservarían dos. Los búferes locales todavía tienen el redondeo propio de Float32; no se atribuye precisión exacta a los píxeles. El inspector usa la evaluación original, no recupera valores desde los píxeles ni las longitudes de las flechas. Se calcula la norma mediante `Math.hypot`, para evitar el desbordamiento prematuro de sumar cuadrados de magnitudes grandes.

La malla cartesiana contiene \(n^3\) puntos, con \(n\in\{5,9,13,17,21\}\), e incluye los extremos de los intervalos. El corte contiene \(65^2\) o \(129^2\) muestras. El punto inspeccionado se evalúa directamente, por lo que cambiar la densidad no modifica su valor matemático.

## Catálogo de referencia

Todos los campos del catálogo están definidos en \(\mathbb R^3\). Sus operadores se conservan como referencias cerradas independientes del diferenciador.

| Campo | \(\mathbf F\) | \(\nabla\cdot\mathbf F\) | \(\nabla\times\mathbf F\) | Ceros y curvas |
|---|---|---:|---|---|
| Uniforme | \((1,0,0)\) | \(0\) | \((0,0,0)\) | Sin ceros; rectas orientadas hacia \(+x\) |
| Radial saliente | \((x,y,z)\) | \(3\) | \((0,0,0)\) | Cero en el origen; semirrectas hacia fuera |
| Radial entrante | \((-x,-y,-z)\) | \(-3\) | \((0,0,0)\) | Cero en el origen; semirrectas hacia dentro |
| Rotacional | \((-y,x,0)\) | \(0\) | \((0,0,2)\) | Ceros en todo el eje \(z\); circunferencias a \(z\) constante |
| Helicoidal | \((-y,x,a)\) | \(0\) | \((0,0,2)\) | Hélices fuera del eje; rectas sobre él si \(a\ne0\). Si \(a=0\), coincide con el rotacional |
| Silla | \((x,-y,0)\) | \(0\) | \((0,0,0)\) | Ceros en el eje \(z\); \(z\) e \(xy\) permanecen constantes sobre cada curva |

El giro del rotacional es antihorario visto desde \(+z\). En el helicoidal, una vuelta cambia \(z\) en \(2\pi a\); `a=1` es su valor inicial. Divergencia cero no implica campo constante ni ausencia de deformación, como muestra la silla. Un cero de \(\nabla\times\mathbf F\) no es un equilibrio de \(\mathbf F\).

## Lenguaje de expresiones

Se admiten `x`, `y`, `z`, los parámetros escalares `a`, `b`, `c`, las constantes `pi`, `e`, los operadores `+`, `-`, `*`, `/`, `^` y paréntesis. Las funciones `sin`, `cos`, `tan`, `exp`, `log`, `sqrt` reciben exactamente un argumento; los ángulos están en radianes. Se usa punto decimal, también en notación científica como `1.25e-3*x`, y multiplicación explícita: `2*x`.

El motor analiza el árbol de cada componente antes de compilarla, con una lista cerrada de construcciones permitidas: constantes finitas, símbolos autorizados, operadores autorizados, funciones autorizadas y paréntesis. No admite asignaciones, matrices, objetos, cadenas, acceso a propiedades, comparaciones, instrucciones múltiples, funciones de usuario, unidades ni azar. No ejecuta código JavaScript introducido por el usuario.

Cada componente se limita a 256 caracteres, 128 nodos y profundidad 24. Solo se muestran y exigen los parámetros realmente usados. Los parámetros personalizados parten de 1, con intervalo de −5 a 5 y paso 0,1; sus valores y límites deben ser finitos, el mínimo menor que el máximo y el paso positivo.

Una expresión sintácticamente válida puede estar definida solo en parte de la caja. Por ejemplo, `sqrt(x)` produce resultados complejos en \(x<0\); `1/x` no es finita en \(x=0\). Esos puntos no se convierten en ceros.

## Jacobiano, divergencia y rotacional

El jacobiano usa filas \(P,Q,R\) y columnas \(x,y,z\):

\[
J=\begin{pmatrix}
P_x&P_y&P_z\\
Q_x&Q_y&Q_z\\
R_x&R_y&R_z
\end{pmatrix}.
\]

Los operadores tridimensionales son

\[
\nabla\cdot\mathbf F=P_x+Q_y+R_z,
\qquad
\nabla\times\mathbf F=(R_y-Q_z,\;P_z-R_x,\;Q_x-P_y).
\]

En modo automático, el catálogo exacto usa sus referencias analíticas. Un campo personalizado intenta derivar simbólicamente las nueve entradas, con un máximo de 512 nodos por derivada y un presupuesto de preparación de 75 ms. Si no consigue preparar todas las entradas o no obtiene resultados reales finitos en un punto, utiliza diferencias finitas centrales. El modo **Diferencias finitas** fuerza ese método, incluso en el catálogo.

El campo original se evalúa antes de cualquier derivada. Una simplificación simbólica no puede hacer desaparecer una singularidad de la expresión original. El inspector identifica el método aplicado y su diagnóstico. El error `0` de una referencia analítica o una derivada simbólica significa que no se utilizó la estimación por stencil; no certifica regularidad ni precisión global de la expresión.

### Diferencias finitas centrales

Para cada eje \(j\), con ancho \(L_j\) de la caja, se inicia

\[
h_j=\eta\max(1,|r_j|,L_j),\qquad \eta=10^{-4}\ \text{por defecto}.
\]

Cada entrada se aproxima mediante

\[
D_h F_i(\mathbf r)=
\frac{F_i(\mathbf r+h\mathbf e_j)-F_i(\mathbf r-h\mathbf e_j)}{2h}.
\]

Se comparan \(D_h\) y \(D_{h/2}\); se conserva el segundo y se estima

\[
E_{ij}=\frac{|D_{h/2}F_i-D_hF_i|}{3}.
\]

Se permiten hasta tres reducciones adicionales del paso. Una columna converge cuando todas sus entradas cumplen

\[
E_{ij}\le10^{-7}\max(1,A_i/L_j)+10^{-4}|D_{h/2}F_i|,
\]

con \(A_i\) igual al máximo valor absoluto de esa componente en las cuatro muestras del stencil. El error mostrado es el máximo de las estimaciones finales de las nueve entradas. Si se obtienen valores finitos pero no converge alguna columna, la derivada se marca **No fiable** y se conserva el diagnóstico; no se presenta su divergencia o rotacional como dato gráfico fiable.

El stencil usa el dominio natural y puede salir de la caja de visualización. Si falla uno de sus lados, no se sustituye por una diferencia unilateral ni por cero. Un paso no representable, una evaluación inválida o un desbordamiento hacen que la derivada no esté disponible. La estimación local de error no demuestra diferenciabilidad.

## Líneas de corriente

Las curvas integrales de un campo estacionario satisfacen \(d\mathbf r/d\tau=\mathbf F(\mathbf r)\). Para representar su geometría se integra

\[
\frac{d\mathbf r}{ds}=\mathbf g_\sigma(\mathbf r)
=\sigma\frac{\mathbf F(\mathbf r)}{\|\mathbf F(\mathbf r)\|},\qquad\sigma\in\{+1,-1\}.
\]

Donde el campo es regular y no nulo, esta normalización conserva las curvas y elimina la información de rapidez. Se integran ambas ramas desde cada semilla; los chevrones de ambas apuntan según \(\mathbf F\), incluso en la rama calculada con signo negativo. Las líneas conservan su geometría 3D cuando hay un corte visible.

Las semillas predeterminadas son 16 puntos de la secuencia determinista Halton, con bases 2, 3 y 5, dentro del 80 % central de cada intervalo. Sus coordenadas explícitas se guardan en el JSON. Una semilla que queda fuera de una nueva caja se conserva inactiva; no se desplaza silenciosamente.

### RK4 fijo y adaptativo

Un avance clásico RK4 desde \(\mathbf r\), de longitud \(h\), calcula

\[
\begin{aligned}
k_1&=\mathbf g_\sigma(\mathbf r),\\
k_2&=\mathbf g_\sigma(\mathbf r+hk_1/2),\\
k_3&=\mathbf g_\sigma(\mathbf r+hk_2/2),\\
k_4&=\mathbf g_\sigma(\mathbf r+hk_3),\\
\mathbf r_{h}&=\mathbf r+h(k_1+2k_2+2k_3+k_4)/6.
\end{aligned}
\]

En modo adaptativo se compara un paso completo con dos medios pasos, conservando el resultado de estos últimos:

\[
E=\frac{\|\mathbf r_{h/2,h/2}-\mathbf r_h\|}{15},
\qquad
T(h)=\mathrm{atol}+\mathrm{rtol}\,h.
\]

Se acepta si \(E\le T(h)\). El factor siguiente es \(0.9(T/E)^{1/5}\), limitado entre 0,2 y 2; si \(E=0\), se usa 2. El paso adaptativo se mantiene entre sus límites. Si un intento falla la tolerancia y ya está en el paso mínimo, termina con ese motivo. El modo fijo usa el paso inicial y no aplica esta comparación adaptativa.

Sea \(\ell\) la diagonal de la caja. Valores iniciales:

| Ajuste | Valor |
|---|---:|
| Paso inicial | \(0.01\ell\) |
| Paso mínimo | \(10^{-6}\ell\) |
| Paso máximo | \(0.025\ell\) |
| Tolerancia absoluta | \(10^{-6}\ell\) |
| Tolerancia relativa | \(10^{-5}\) |
| Umbral de magnitud para integrar | \(10^{-10}\) |
| Longitud máxima por rama | \(8\ell\) |
| Pasos aceptados por rama | 1 500 |

La longitud registrada suma los avances del parámetro geométrico \(s\), no el tiempo físico. El error estimado es local; la aceptación de pasos no garantiza por sí sola un error global.

### Paradas y cierre

Se distinguen frontera de la caja, campo no definido, magnitud bajo el umbral, paso mínimo, longitud máxima, pasos máximos, límite de vértices, tiempo agotado, cancelación, cierre aproximado y semilla exterior. No se dibujan segmentos a través de una región inválida detectada.

Al salir de la caja, se refina el último avance RK4 mediante búsqueda acotada y se conserva un extremo interior; los estadios pueden evaluar fuera de la caja si el campo está definido allí. Los vértices almacenados permanecen dentro de la caja.

El cierre automático es aproximado: tras al menos 20 pasos aceptados, exige distancia a la semilla no mayor que

\[
\max(4\,\mathrm{atol},\min(0.6h,0.01\ell))
\]

y producto escalar entre tangentes inicial y final de al menos 0,95. El último punto mostrado se une a la semilla. Una rama cerrada no se vuelve a recorrer para duplicar la misma curva; este criterio no prueba periodicidad exacta. Las pruebas de convergencia desactivan el cierre.

La aplicación limita el cálculo de líneas a 5 s y 120 000 vértices totales. Un resultado limitado puede ser parcial; la interfaz informa del motivo de cada parada. Cancelación y presupuestos se comprueban mientras los workers procesan bloques acotados.

## Cortes, escala y signos

| Corte | Proyección vectorial | Componente perpendicular |
|---|---|---|
| XY | \((P,Q,0)\) | \(R\), respecto de \(+z\) |
| XZ | \((P,0,R)\) | \(Q\), respecto de \(+y\) |
| YZ | \((0,Q,R)\) | \(P\), respecto de \(+x\) |

La misma regla se aplica al rotacional cuando es la capa vectorial elegida. `⊙+` y `⊗−` indican el signo de la componente perpendicular respecto del eje positivo de la tabla. Ese significado permanece al girar la cámara; no cambia al mirar desde el lado opuesto.

La norma escalar siempre es \(\|\mathbf F\|\) completa. Los operadores siguen siendo los tridimensionales evaluados sobre el plano. No se calculan operadores 2D del vector proyectado ni se sustituyen las líneas 3D por curvas integrales de la proyección.

Para flechas proporcionales, la longitud es el mínimo entre escala por norma de la capa y \(0.8\) veces la menor separación de la malla. Las flechas limitadas llevan anillo. En un corte se usa la norma de la proyección para su longitud y se representa por separado la componente perpendicular. La proyección nula de un vector no nulo se distingue del círculo de cero real. Los valores pequeños no reciben una longitud mínima artificial.

La capa escalar utiliza una escala absoluta fija: magnitud de 0 a 6 y divergencia de −3 a 3 inicialmente. El gris codifica magnitud o valor absoluto; signo y estado se codifican además con símbolos y tramas. Valores fuera del intervalo se limitan gráficamente y se cuentan en la leyenda. Las escalas solo cambian por edición o ajuste explícito a las muestras.

Una divergencia analítica exactamente nula se etiqueta `0`; para resultados simbólicos o numéricos con valor absoluto no mayor de \(10^{-7}\), se muestra `≈0`. Es una tolerancia de representación, independiente del umbral de integración y de los ceros de \(\mathbf F\). La textura representa muestras discretas con filtrado de vecino más próximo, sin inventar interpolaciones a través de datos ausentes.

## Evidencia y límites de interpretación

Las referencias y criterios completos están en [VALIDATION.md](../VALIDATION.md), con pruebas en [tests/unit](../tests/unit). [evidence/streamline-errors.json](../evidence/streamline-errors.json) registra, entre otros resultados, error final de \(9.003\times10^{-8}\) para el círculo con 128 pasos y \(2.154\times10^{-7}\) para la hélice. Los cocientes de error de la hélice entre 32, 64 y 128 pasos son aproximadamente 17,01 y 16,22, compatibles con orden cuatro en ese régimen. Reducir diez veces las tolerancias mejora el caso adaptativo medido antes del suelo de redondeo.

El muestreo no localiza necesariamente todos los ceros, singularidades o discontinuidades. El umbral que detiene una línea no demuestra la existencia de un equilibrio. La diferenciación y la integración son aproximaciones locales con límites de redondeo y recursos. Divergencia y rotacional requieren regularidad suficiente para sus interpretaciones geométricas; una divergencia positiva no prueba que haya una fuente puntual dentro de la escena.

Un resultado parcial distingue lo que no se calculó de lo que se calculó como inválido. Ninguno de estos estados se representa como cero. Las cantidades carecen de unidades físicas; interpretar el campo como velocidad o fuerza exige supuestos y unidades adicionales.
