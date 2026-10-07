# Fuentes, procedencia y precisión

Consultado el 7 de octubre de 2026. El resultado se clasifica como **reconstrucción determinista orientativa**, no como levantamiento topográfico. Las cotas convencionales y los relatos de expedición están documentados; sus coordenadas sobre esta malla son reconstruidas o aproximadas.

## Relieve utilizado

Fuente numérica: [K2.pdf de hoshigarasu / terrain-layering-model](https://github.com/hoshigarasu/terrain-layering-model/blob/f7b32fe0f19221e3364440c016ca825d92d420cc/samples/K2.pdf).

- Versión fijada: commit `f7b32fe0f19221e3364440c016ca825d92d420cc`.
- SHA-256 PDF: `ef15f1de17a43f5f7afef4b5eca9d6957897bd9304ae3f4d1173adbcf98b0b95`.
- 26 niveles, 4 650–8 400 m, intervalos de 150 m, 99 polígonos numéricos.
- Escala impresa: 1:58 100. Se usa 20,496 m por punto PDF, igual en los dos ejes. La escala de impresión se toma como referencia aproximada, sin control terrestre.
- El [README de la fuente](https://github.com/hoshigarasu/terrain-layering-model) declara MIT; no aparece un archivo LICENSE independiente en el commit. No se incorpora código de ese repo ni imágenes del PDF: únicamente contornos numéricos con atribución.
- El README menciona SRTM / Copernicus, mientras que el descargador del commit usa AWS Terrain Tiles / Terrarium. **No se puede verificar cuál fue el raster original del PDF**, su versión, resolución, época ni datum vertical. No se le atribuye falsamente GLO-30, NASADEM ni EGM2008.
- Los contornos se extraen de trazos negros; los trazos rojos de la siguiente curva y la imagen de portada se excluyen.

La malla se interpola entre contornos mediante distancias a sus fronteras. Se corrige un píxel de anidamiento y se aplica un filtro de 0,55 celdas para eliminar esquinas de rasterización. La cuadrícula de 513 × 513 y paso 22,656 m **solo definen muestreo del render**. No mejoran la resolución observacional de la fuente.

Se conserva el relieve circundante. Dentro de la última curva de 8 400 m se añade un casquete hasta 8 611 m, con un pequeño ajuste gaussiano local de 30,72 m. Es una reconstrucción de la cumbre, sin reescalar globalmente el raster.

## Coordenadas

Modelo local métrico: X este, Y arriba y Z sur; norte = −Z. La referencia aproximada de la cumbre es 35,8825 N, 76,5133 E. Se calcula el radio de curvatura WGS84 local para convertir este/norte a coordenadas geográficas. La georreferenciación del PDF se reconstruye desde su orientación norte, escala impresa y el centro de su última curva; no hay puntos de control geodésicos.

Origen vertical: 4 500 m; `y = altitud del modelo − 4500`. La máscara de 8 000 m comienza en `y = 3500`, sobre los triángulos del terreno. No se mezclan alturas elipsoidales con un DEM certificado: las altitudes de esta reconstrucción son referencias convencionales aproximadas, cuyo geoide fuente no se ha verificado.

El recorte cubre este [−5 800, +5 800] y sur [−5 200, +6 400] m, 11,6 km de lado. Se mantiene relación horizontal/vertical 1:1 en el render. Los bordes son límites de recorte; no se añaden paredes falsas. Cada LOD cubre el mismo recorte completo, de modo que no existen grietas entre parches.

## Opciones de DEM examinadas

| Opción | Resolución nominal y referencia vertical | Acceso / motivo de no incorporación |
|---|---|---|
| [Copernicus GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | ~30 m; EGM2008. | GLO-30 Public se distribuye bajo licencia Copernicus con atribución. [AWS](https://registry.opendata.aws/copernicus-dem/) ofrece distribución pública; su host no está habilitado en el entorno. El [servicio de visualización](https://dataspace.copernicus.eu/news/2026-7-17-copernicus-dem-30m-view-service-license-acceptance) cambió sus condiciones en julio de 2026; no se supone acceso anónimo ni derecho de redistribución del servicio. |
| [NASADEM, acceso Earthdata](https://urs.earthdata.nasa.gov/documentation/for_users/data_access) | Modelo de elevación SRTM reprocesado; no se ha descargado una tesela ni comprobado su metadata. | El acceso de los DAAC requiere Earthdata Login. El host y credenciales no están preparados en esta sesión; no se afirma haber obtenido datos. |
| [ALOS AW3D30](https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm) | ~30 m; [JAXA describe EGM96](https://www.eorc.jaxa.jp/ALOS/en/inquiry/faq_e.htm). | Descarga vía JAXA y su registro. Host no habilitado; no se incorpora raster ni se declara aceptación de condiciones por el usuario. |

La política de red limita la descarga desde el shell a repositorios Git y gestores de paquetes. No se elude ni se pide una credencial privada para entregar una montaña ya preparada.

## Anotaciones y rutas

Las semillas editoriales y referencias están en `data/k2/annotations.json`; las posiciones y trazados preparados en `public/k2/atlas.json`. Se proyectan todas las muestras al terreno. Las cotas de campamentos son referencias de expediciones, no mediciones GPS. Si el relieve y una cota difieren más de 35 m, la ficha lo explica.

- [Garrett Madison, 23 julio 2023](https://madisonmountaineering.com/summit-rotation-underway/): BC 4 968, C1 6 065, C2 6 700, C3 7 250, C4 7 681 m. [ABC: 5 303 m](https://madisonmountaineering.com/first-rotation-is-underway/). Se elige esta variante de Abruzzi con Camp IV bajo en el Hombro.
- [Philippe Gatta](https://www.philippegatta.com/k2-pakistan/): descripción del espolón, Hombro, Bottleneck y travesía a la izquierda bajo el serac. Sus fotografías tienen derechos reservados; no se copian.
- [AAJ 1997, Waldo Farias](https://publications.americanalpineclub.org/articles/12199732500): Česen, expedición chilena de 1996; C1 6 300, C2 7 000, C3 ~7 600 m en el Hombro. Son fichas independientes de Abruzzi; no se inventa un Camp IV Česen.
- [AAJ 1988](https://publications.americanalpineclub.org/articles/12198824402/Asia-Pakistan-K2-South-Southeast-Spur-Attempt): variante histórica de Česen diferente, evidencia de que la numeración y las cotas no son universales.
- [AAJ 2005](https://publications.americanalpineclub.org/articles/12200535103/): corredor bajo una barrera de seracs y cambios del hielo entre expediciones. Bottleneck, pared de hielo y travesía se representan como elementos distintos.
- [Campo base, Mapcarta / OSM 4844636351](https://mapcarta.com/N4844636351): ~35,8346 N, 76,5093 E. © colaboradores de OpenStreetMap, [ODbL](https://www.openstreetmap.org/copyright). Posición aproximada, no asociada a una expedición exacta.

Las polilíneas son reconstruidas; no existe GPX de expedición en esta entrega. Segmentos lineales densificados a ≤8 m se proyectan al relieve, sin splines que creen atajos por el aire. El tramo Hombro → Bottleneck → travesía → cumbre se almacena una sola vez. En pantalla se usa una elevación visual de 20 m sobre la malla visible, con prueba de profundidad. La trayectoria lógica conserva la altura de la cuadrícula fina, separada de esa proyección por LOD.

House’s Chimney y Black Pyramid se describen en las fichas pertinentes, pero no se colocan marcadores precisos sin respaldo suficiente para esas posiciones. No se deducen por simple interpolación entre campamentos.

## Referencias visuales

| Orientación | Recurso | Autor / fecha / licencia |
|---|---|---|
| Sur, mirando al norte | [Approaching K2 Base Camp](https://commons.wikimedia.org/wiki/File:Approaching_K2_Base_Camp.jpg) | Zacharie Grossen, 2015, CC BY-SA 4.0; incluye Godwin-Austen y Hombro. |
| Norte, desde China | [K2 Nordseite](https://commons.wikimedia.org/wiki/File:K2_Nordseite.jpg) | Kuno Lechner, 1986, CC BY-SA 3.0. |
| Este, lateral histórica | [K2 East Face 1909](https://commons.wikimedia.org/wiki/File:K2_East_Face_1909.jpg) | Luigi Amedeo, 1909, dominio público indicado en la ficha. |
| Relaciones de rutas SSE y SE | [K2 south routes](https://commons.wikimedia.org/wiki/File:K2_south_routes.jpg) | Kogo / Iain99, 2004 / 2008, CC BY-SA 3.0. Solo E/F; la ficha advierte un error en otra ruta. |

Son referencias enlazadas y consultadas, sin imágenes redistribuidas ni textura fotográfica. Las capturas del atlas corresponden a su render real y no a esas fotografías. No se certifica equivalencia fotogramétrica ni exactitud del estado del hielo.

## Materiales e hielo

`prepare-materials.py` genera texturas registradas al mismo recorte con semilla fija 20261008: albedo de 2048², normales en espacio del objeto de 2048² y grano repetible de 512². Los colores combinan pendiente, concavidad, orientación, altura y variación de superficie para interpretar roca estratificada, nieve en corredores y glaciares con morrenas sinuosas. La cumbre reconstruida conserva un casquete nival. El albedo se usa en **todos** los perfiles; Baja usa Lambert con detalle precalculado y Media/Alta PBR con normales. En Media/Alta el grano fino se proyecta de forma triplanar en las caras empinadas.

El texel de ~5,67 m es densidad del asset visual, sin certificar resolución geográfica. La rugosidad de 1–6 m se utiliza exclusivamente para sombreado; no mueve las posiciones del terreno, las rutas ni las colisiones. El detalle no procede de fotografías satelitales o un levantamiento del hielo. La antigua textura de grano de 256² se conserva como asset del pipeline original y no interviene en el render actual.

El serac es una malla 3D independiente de ~190 m de longitud, con base retraída, frente erosionado, labio sobresaliente y fracturas visuales. Tamaño, posición fina y forma son decisiones de reconstrucción; no proceden de una medición ni describen una expedición actual. La cámara comprueba los volúmenes de esta malla además del heightfield.

`prepare-clouds.py` genera una textura RGBA de 1024×512 con semilla 20261007: densidad 3D, erosión multiescala y sombreado por espesor óptico hacia el sol. Se sitúan bancos distantes detrás del relieve con prueba de profundidad, sin animación permanente, y se pueden ocultar. El cielo es un gradiente de altura con dispersión solar sutil. Nubes y color del cielo son una interpretación atmosférica, sin datos meteorológicos ni fotografía externa.

No se afirma precisión centimétrica, resolución de 22,7 m medida, porcentaje de exactitud, ni un modelo actual de riesgo o meteorología.
