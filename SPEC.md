# Objetivos, alcance y requisitos

### 1. Objetivo y criterios de éxito

Construir un laboratorio para explorar campos estacionarios:

\[
\mathbf F(x,y,z)=\bigl(P(x,y,z),Q(x,y,z),R(x,y,z)\bigr).
\]

El usuario podrá modificar sus componentes y parámetros, observar su geometría, inspeccionar valores y contrastar resultados analíticos y numéricos.

La versión inicial estará terminada cuando:

- Los seis campos del catálogo y las expresiones admitidas puedan explorarse sin bloquear la interfaz.
- Ecuaciones, escena, inspector y leyendas correspondan siempre al mismo experimento aplicado.
- Los métodos superen las pruebas matemáticas definidas en `VALIDATION.md`.
- Las configuraciones puedan exportarse y recuperarse conservando los resultados.
- La interfaz y la escena cumplan la dirección monocromática y la revisión visual.
- Existan instrucciones reproducibles de instalación, ejecución, limitaciones y validación.

Será una herramienta educativa y de experimentación numérica. No certificará propiedades globales de campos arbitrarios ni sustituirá un sistema de álgebra computacional.

### 2. Alcance

| Versión inicial obligatoria | Ampliaciones posteriores | Fuera del alcance previsto |
|---|---|---|
| Seis campos predefinidos | Campos \(\mathbf F(x,y,z,t)\) | Resolución de ecuaciones de Navier–Stokes u otras EDP |
| Editor de \(P,Q,R\) | Partículas y trayectorias temporales | Simulación física con materiales y condiciones de contorno |
| Parámetros escalares `a`, `b`, `c` | Flujo por superficies orientadas | Certificación simbólica de propiedades globales |
| Dominio rectangular y densidad ajustables | Circulación por curvas orientadas | Detección exhaustiva de singularidades o equilibrios |
| Flechas y magnitud | Planos oblicuos y superficies arbitrarias | Cuentas, colaboración y almacenamiento en servidores |
| Líneas de corriente con semillas | Comparación simultánea de experimentos | Realidad virtual y aplicaciones nativas |
| Inspector puntual | Exportación de datos científicos | Soporte completo para teléfonos |
| Cortes XY, XZ y YZ | Análisis dimensional y unidades físicas | Publicación y despliegue durante esta fase |
| Divergencia y rotacional | Integradores especializados | |
| Exportación PNG y configuración JSON | Instalación como PWA | |

Para mantener una primera versión sólida:

- Habrá un solo plano de corte activo.
- El campo y su rotacional se alternarán como capa vectorial principal.
- La divergencia se representará en el corte y en el inspector.
- No habrá animación del campo en la versión inicial.
- No habrá un lenguaje de programación dentro del editor matemático.

### 3. Fundamentos matemáticos

**Dominio.** Coordenadas cartesianas dextrógiras, con \(z\) vertical. Se distinguirá el dominio natural \(\Omega\), donde las expresiones producen valores reales finitos, de la caja de visualización:

\[
B=[x_{\min},x_{\max}]
\times[y_{\min},y_{\max}]
\times[z_{\min},z_{\max}].
\]

La región efectivamente explorada será \(B\cap\Omega\). La caja no constituye una frontera física.

Por defecto, \(B=[-3,3]^3\). Los ejes tendrán la misma escala espacial; no se deformará cada eje para llenar la pantalla.

**Magnitud y dirección.**

\[
\|\mathbf F\|=\sqrt{P^2+Q^2+R^2},\qquad
\widehat{\mathbf F}=\frac{\mathbf F}{\|\mathbf F\|}.
\]

La dirección solo existe cuando \(\|\mathbf F\|>0\). El inspector siempre mostrará las componentes originales, independientemente del tamaño de las flechas.

**Ceros y equilibrios.** Un cero del campo satisface \(P=Q=R=0\). En un sistema autónomo \(\dot{\mathbf r}=\mathbf F(\mathbf r)\), es un equilibrio. Se distinguirán:

- Equilibrios analíticos conocidos del catálogo.
- Ceros encontrados al evaluar muestras.
- Magnitudes pequeñas respecto del umbral numérico.

Encontrar muestras pequeñas no demostrará la existencia de un equilibrio ni localizará todos los ceros.

**Divergencia y rotacional.**

\[
\nabla\cdot\mathbf F=P_x+Q_y+R_z,
\]

\[
\nabla\times\mathbf F=
\left(R_y-Q_z,\;P_z-R_x,\;Q_x-P_y\right).
\]

La interpretación local de expansión, contracción y giro requerirá regularidad suficiente. Un valor positivo de divergencia no implicará por sí solo que las líneas tengan un origen puntual dentro de la escena.

**Líneas de corriente.** Para un campo estacionario, las curvas integrales satisfacen:

\[
\frac{d\mathbf r}{d\tau}=\mathbf F(\mathbf r).
\]

Para dibujar su geometría, la versión inicial integrará:

\[
\frac{d\mathbf r}{ds}=
\pm\frac{\mathbf F(\mathbf r)}{\|\mathbf F(\mathbf r)\|}.
\]

En regiones regulares y sin ceros, ambas formulaciones recorren las mismas curvas. La segunda utiliza longitud de arco y pierde la información de rapidez. El signo negativo sirve para prolongar la curva hacia atrás; las marcas de dirección dibujadas seguirán apuntando según \(\mathbf F\).

**Cortes.** Un corte evalúa el campo en puntos de un plano. En la vista plana se mostrarán las proyecciones:

- XY: \((P,Q,0)\), con componente perpendicular \(R\).
- XZ: \((P,0,R)\), con componente perpendicular \(Q\).
- YZ: \((0,Q,R)\), con componente perpendicular \(P\).

La divergencia y el rotacional seguirán siendo los del campo tridimensional, evaluados sobre el plano. No se sustituirán por operadores bidimensionales.

Las líneas 3D que crucen el corte no se convertirán en líneas integrales del campo proyectado.

**Singularidades.** Una expresión inválida, un resultado complejo, un valor no finito y una derivada no disponible serán estados diferentes. Ninguno se representará como cero.

El muestreo no podrá garantizar que se hayan encontrado todas las singularidades o discontinuidades entre muestras.

**Unidades.** La versión inicial utilizará cantidades adimensionales. Interpretar \(\mathbf F\) como velocidad, fuerza u otra magnitud requerirá declarar unidades y supuestos adicionales.

En una ampliación de partículas:

\[
\frac{d\mathbf r}{dt}=\mathbf F(\mathbf r,t)
\]

solo representará velocidad física si las componentes tienen unidades de longitud/tiempo. Una animación con velocidad normalizada será un recurso de visualización, y se identificará como tal.

### 4. Catálogo inicial

Los seis campos están definidos en todo \(\mathbb R^3\). El parámetro helicoidal \(a\) puede ser cualquier número real.

| Campo y ecuación | Divergencia | Rotacional | Equilibrios | Geometría e interpretación educativa |
|---|---:|---|---|---|
| Uniforme: \((1,0,0)\) | \(0\) | \((0,0,0)\) | Ninguno | Vectores paralelos de igual magnitud; líneas rectas paralelas a \(x\). Referencia para dirección constante e integración. |
| Radial saliente: \((x,y,z)\) | \(3\) | \((0,0,0)\) | Origen | Magnitud proporcional a la distancia al origen; semirrectas orientadas hacia fuera. Expansión local sin giro. |
| Radial entrante: \((-x,-y,-z)\) | \(-3\) | \((0,0,0)\) | Origen | Semirrectas orientadas hacia el origen. Contracción local sin giro. |
| Rotacional: \((-y,x,0)\) | \(0\) | \((0,0,2)\) | Eje \(z\) completo | Circunferencias en planos \(z=\text{constante}\); giro antihorario visto desde \(+z\). Rotación sin divergencia. |
| Helicoidal: \((-y,x,a)\) | \(0\) | \((0,0,2)\) | Ninguno si \(a\neq0\); eje \(z\) si \(a=0\) | Hélices de radio constante fuera del eje; sobre el eje, rectas si \(a\neq0\). Desplazamiento vertical por vuelta: \(2\pi a\). |
| Silla: \((x,-y,0)\) | \(0\) | \((0,0,0)\) | Eje \(z\) completo | Expansión en \(x\), contracción en \(y\), \(z\) constante; curvas \(xy=\text{constante}\). Divergencia nula no significa campo constante ni ausencia de deformación. |

Solo el helicoidal tendrá un parámetro propio: `a=1`, con deslizador inicial de −3 a 3 y paso 0,1. Los demás no tendrán parámetros artificiales.

Los valores analíticos se almacenarán como referencias independientes de los algoritmos de diferenciación. No se utilizará el mismo cálculo simbólico para producir el resultado y su valor esperado en las pruebas.

### 5. Expresiones, parámetros y límites

El editor admitirá:

- Variables `x`, `y`, `z`.
- Parámetros `a`, `b`, `c`, mostrando únicamente los utilizados.
- Constantes `pi`, `e`.
- Operadores `+`, `-`, `*`, `/`, `^` y paréntesis.
- Funciones `sin`, `cos`, `tan`, `exp`, `log`, `sqrt`; argumentos angulares en radianes.
- Multiplicación explícita: `2*x`.
- Punto decimal en las expresiones; la ayuda explicará esta convención.

No se admitirán asignaciones, funciones definidas por el usuario, matrices, acceso a propiedades, cadenas, unidades, comparaciones, instrucciones múltiples ni funciones aleatorias.

Límites iniciales:

| Recurso | Predeterminado | Máximo o restricción |
|---|---|---|
| Longitud de una componente | — | 256 caracteres |
| Árbol de una componente | — | 128 nodos y profundidad 24 |
| Muestras por eje | 9 | Opciones 5, 9, 13, 17 y 21 |
| Muestras de corte | \(65^2\) | \(129^2\) |
| Semillas | 16 | 64 |
| Vértices de líneas | Según integración | 120 000 en total |
| Pasos aceptados por sentido y semilla | Según integración | 1 500 |
| Configuración importada | — | 1 MiB |
| Coordenadas del dominio | −3 a 3 | Extremos con valor absoluto ≤ \(10^4\) |
| Longitud de cada intervalo | 6 | Entre \(10^{-3}\) y \(10^4\) |

Los parámetros personalizados comenzarán en 1, con intervalo −5 a 5 y paso 0,1, editables dentro de límites finitos. Se exigirá `mínimo < máximo`, paso positivo y valor dentro del intervalo.

Los límites de recursos serán visibles cuando afecten al resultado.

### 6. Flujos y estados

| Acción | Comportamiento |
|---|---|
| Elegir un campo | Carga sus ecuaciones y parámetros. Conserva dominio, cámara y escalas para facilitar comparaciones. |
| Editar ecuaciones | Mantiene un borrador. Valida tras 300 ms de inactividad; solo aplica mediante **Aplicar** o `Ctrl+Enter`. |
| Escribir una expresión parcial | Mantiene la última escena válida y muestra “Cambios sin aplicar”. No genera errores intrusivos mientras se escribe. |
| Cambiar parámetros | Actualiza el campo tras 150 ms de inactividad; recalcula líneas tras 350 ms o al terminar la interacción. |
| Cambiar dominio o densidad | Valida el conjunto antes de aplicarlo. Los campos numéricos incompletos no alteran la escena. |
| Activar capas | Mantiene visibles sus leyendas. Campo/rotacional y magnitud/divergencia serán selectores excluyentes dentro de su categoría. |
| Explorar cortes | Selecciona orientación y posición; permite orientar la cámara perpendicularmente al plano. |
| Inspeccionar | Selección de una muestra, clic sobre el corte o entrada exacta de \(x,y,z\). Un clic en espacio vacío no inventa profundidad. |
| Gestionar semillas | Regenerar 16 semillas, añadir el punto inspeccionado, eliminar la última o vaciar la lista. |
| Restablecer cámara | Centra y encuadra el dominio actual. |
| Restablecer experimento | Recupera el estado inicial completo: campo rotacional, dominio, parámetros, capas, escalas, semillas y cámara. |
| Exportar | Guarda exclusivamente el estado aplicado. Indica si existen cambios pendientes. |
| Importar | Valida y prepara el experimento antes de reemplazar el actual. Si falla, conserva el estado anterior. |

Estados explícitos: listo, cambios pendientes, calculando, resultado parcial, sin muestras válidas, expresión inválida, derivada no disponible, límite de recursos y WebGL no disponible.

Durante un cálculo se conservará la última escena coherente. Su ecuación y leyenda permanecerán asociadas a esa escena hasta publicar la nueva revisión. Las líneas antiguas no aparecerán sobre un campo nuevo.

