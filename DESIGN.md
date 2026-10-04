# Dirección visual y representación científica

### 1. Concepto y composición

La pantalla se diseñará como una **mesa de trabajo científica oscura**, con la escena como elemento dominante. No habrá portada, tarjetas promocionales ni decoración que compita con el campo.

A 1440 × 900:

- Barra superior de 56 px.
- Panel izquierdo de 320 px.
- Escena ocupando el espacio restante.
- Inspector contextual de hasta 288 px, visible solo cuando se solicita.
- Leyenda dentro de una franja reservada de la escena, sin superponerse al inspector.
- Ayuda en un panel temporal accesible desde la barra superior.

El panel izquierdo contendrá:

1. Selector de campo.
2. Componentes \(P,Q,R\).
3. Parámetros utilizados.
4. Secciones plegables: dominio y muestreo, capas, líneas, cortes y métodos numéricos.

La ayuda explicará las distinciones matemáticas del proyecto. Los ajustes numéricos estarán accesibles en una sección propia, con unidades, método activo y significado de cada tolerancia.

### 2. Sistema visual

| Elemento | Especificación |
|---|---|
| Fondo | `#101010` |
| Superficies | `#181818` |
| Superficies elevadas | `#242424` |
| Separadores decorativos | `#404040` |
| Bordes funcionales | `#808080` |
| Texto secundario | `#B0B0B0` |
| Texto principal | `#F5F5F5` |
| Flechas principales | `#D0D0D0` |
| Foco | Contorno de 2 px `#F5F5F5`, separado 2 px |
| Tipografía | Inter local; respaldo `system-ui` |
| Datos y editor | Fuente monoespaciada del sistema, cifras tabulares |
| Ecuaciones | KaTeX local, conservando representación accesible |
| Escala tipográfica | 12 px metadatos; 14 px controles; 16 px texto; 20 y 24 px títulos |
| Interlineado | 1,5 en texto; 1,35 en controles |
| Espaciado | Múltiplos de 4 px; base de 8, 12, 16 y 24 px |
| Controles | Altura mínima de 40 px; 44 px en interfaz táctil |
| Radios | 6 px controles; 8 px paneles flotantes |
| Sombras | Negras, suaves, reservadas a elementos superpuestos |
| Transiciones | 120–160 ms; eliminadas con movimiento reducido |

`#404040` se reservará para separadores: su contraste sobre `#181818` es aproximadamente 1,71:1. Para bordes necesarios para reconocer controles se utilizará `#808080`, que alcanza aproximadamente 3,93:1 sobre `#242424`.

El texto secundario sobre la superficie elevada alcanza aproximadamente 7,16:1. Se exigirá al menos 4,5:1 para texto ordinario y 3:1 para elementos gráficos funcionales, según los criterios pertinentes de [contraste textual](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) y [contraste no textual del W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Todos los colores, incluidos gráficos, iconos, focos y mensajes, tendrán componentes RGB iguales. No se emplearán ejes rojos, verdes o azules.

### 3. Codificación científica

| Información | Representación | Regla de interpretación |
|---|---|---|
| Sentido de \(\mathbf F\) | Asta y punta cónica | La punta señala la dirección positiva del campo. |
| Magnitud vectorial | Longitud proporcional | Grosor y luminosidad constantes. |
| Modo “Solo dirección” | Flechas de longitud uniforme | Leyenda explícita: la longitud no representa magnitud. |
| Cero evaluado | Pequeño círculo sin flecha | Sin dirección asignada. |
| Líneas de corriente | Trazo continuo fino con pequeños chevrones | Grosor constante, sin codificar rapidez. |
| Semillas | Cruces pequeñas | Se distinguen de ceros y selecciones. |
| Punto seleccionado | Rombo con doble contorno y etiqueta | La selección no depende de un gris más claro. |
| Plano | Contorno discontinuo, nombre y coordenada | Ejemplo: `XY · z = 0`. |
| Magnitud escalar | Luminosidad de oscuro a claro en el corte | Escala numérica permanente. |
| Divergencia positiva | Símbolo `+` y trama diagonal | Luminosidad representa valor absoluto, no signo. |
| Divergencia negativa | Símbolo `−` y trama diagonal opuesta | Mismo intervalo absoluto que el positivo. |
| Divergencia próxima a cero | Etiqueta `≈0`, sin trama de signo | Umbral visible. |
| Divergencia analítica nula | Etiqueta `0` | Reservada a resultados analíticos conocidos. |
| Rotacional | Flechas con doble punta y etiqueta \(\nabla\times\mathbf F\) | Escala independiente de la de \(\mathbf F\). |
| Dato no definido | Trama cruzada y texto “No definido” | Nunca se confunde con cero. |

Las tramas y símbolos del corte se distribuirán con separación suficiente para no producir una textura ilegible. El inspector ofrecerá el valor exacto de la muestra seleccionada.

Sobre regiones claras del corte, los glifos tendrán contorno oscuro para conservar su silueta.

**Escalas.**

- Escala inicial de flechas del campo: \(0,1\) unidades espaciales por unidad de magnitud.
- Longitud máxima visual: \(0,8\) veces la menor separación de la malla.
- Una flecha limitada llevará una marca de saturación; la leyenda informará cuántas están limitadas.
- No se aplicará una longitud mínima que falsee magnitudes pequeñas. Un vector demasiado pequeño para distinguirse se señalará como tal y podrá consultarse.
- Magnitud escalar: intervalo inicial \([0,6]\).
- Divergencia: intervalo simétrico inicial \([-3,3]\).
- Rotacional: escala inicial de flechas de \(0,2\) unidades espaciales por unidad de magnitud.

Las escalas permanecerán fijas al cambiar campos o parámetros. **Ajustar escala** será una acción explícita calculada con las muestras válidas actuales. Su resultado se guardará en la configuración.

Para comparar capturas también se deberán mantener dominio, cámara, densidad y tamaño de salida. Las longitudes proyectadas en pantalla no sustituirán al valor numérico de la norma.

### 4. Cámara, interacción y accesibilidad

Se utilizará cámara ortográfica, orientación oblicua inicial, \(z\) vertical y controles de órbita, desplazamiento y zoom. La proyección ortográfica facilitará comparaciones sin reducción por distancia.

- Ratón: arrastre para órbita; rueda para zoom; arrastre secundario para desplazamiento.
- Teclado, con la escena enfocada: cursores para órbita, `Shift` + cursores para desplazamiento, `+`/`−` para zoom y `Home` para encuadrar.
- Botones accesibles para vistas XY, XZ, YZ y oblicua.
- `Escape` cierra paneles temporales y devuelve el foco a su activador.
- Los atajos de cámara no actuarán mientras se escribe en un control.
- Formularios con etiquetas persistentes; unidades y ayuda asociadas.
- Errores con icono, título y explicación; éxito con marca y texto; advertencias con triángulo y texto.
- Resultados y estados importantes disponibles como texto, sin depender del lienzo.
- Cambios de estado anunciados mediante una región accesible, sin narrar continuamente cada movimiento del deslizador.

No habrá movimiento automático de cámara. La ampliación de partículas deberá incorporar pausa y respetar movimiento reducido.

### 5. Adaptación a pantallas pequeñas

| Tamaño | Comportamiento |
|---|---|
| ≥1280 px | Panel de 320 px, escena amplia e inspector contextual |
| 1024–1279 px | Panel de 288 px; inspector temporal |
| 768–1023 px | Escena principal y panel de controles desplegable |
| <768 px | Vista inicial centrada en un corte; controles e inspector en panel inferior |

En teléfonos se podrán editar ecuaciones, consultar puntos y explorar cortes. La manipulación 3D densa no tendrá garantía de comodidad ni rendimiento equivalente al escritorio.

No se reducirá automáticamente la precisión matemática por el tamaño de pantalla. Un perfil de representación ligera, si se activa, indicará sus cambios de densidad.

