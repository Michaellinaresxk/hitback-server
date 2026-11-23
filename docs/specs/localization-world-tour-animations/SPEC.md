# HITBACK — Localización completa y llegada dinámica a venues

- **Estado:** Approved
- **Owner:** HITBACK Expo
- **Creado:** 2026-11-07
- **Issue/PR relacionado:** ninguno

## Problema

La app ya usa `i18next`/`react-i18next` y ofrece español, inglés y polaco, pero el
cambio de idioma no se conserva al reiniciar. World Tour tiene 58 ciudades en
sus pools; solo 32 tienen contenido en `tour.cities` y `TourLandingModal`
prefiere el JSON estructural, cuyo contenido editorial está escrito en español.
Por ello, elegir inglés o polaco no garantiza que el nombre, venue, historia y
dato del aterrizaje aparezcan en ese idioma.

Además, solo 9 de los 50 archivos TSX de `app/` y `components/` usan
`useTranslation`; varias pantallas, alertas, mensajes de partida y modales
mantienen texto visible codificado directamente. El aterrizaje actual es un
modal deslizante con información estática; no comunica la llegada como un
momento de gira/concierto.

## Usuarios y contexto

Personas que configuran y juegan una partida local en Expo. El idioma es una
preferencia de la instalación, no una propiedad de la sesión ni del jugador.
World Tour y la llegada al venue son estado y presentación locales de Expo.

## Comportamiento actual verificado

- `hitback/i18n/index.js` carga los recursos estáticos `es`, `en` y `pl`, toma
  inicialmente el idioma del sistema y usa inglés como fallback.
- `components/LanguagePicker.tsx` llama `i18n.changeLanguage()`, pero no guarda
  la selección para el siguiente inicio.
- Los tres JSON tienen 335 hojas y el mismo conjunto estructural de claves.
  Cada uno tiene 34 entradas bajo `tour.cities`: los IDs `start` y `finish` y
  32 de las 58 ciudades que realmente se sortean.
- Los 26 IDs restantes no tienen entrada de locale en ninguno de los idiomas:
  `theRoxy`, `bataclan`, `koko`, `tempodrom`, `clashClub`, `viejaUsina`,
  `theGarage`, `scala`, `pointEphemere`, `rockpalast`, `astoria`, `maFoi`,
  `lindenpark`, `palauSantJordi`, `bercy`, `morumbiSP`, `nurburgring`,
  `velezSarsfield`, `johannesburgDome`, `tokyoDome`, `o2London`,
  `lollapalooza`, `estadioNacional`, `lanxessArena`, `riverbend` y
  `commonwealthStadium`.
- El JSON fuente de ciudades conserva `name`, `location`, `venue`, `story` y
  `realFact` en español. `TourLandingModal` lee esos campos directamente y
  solo usa claves i18next como fallback si falta la ciudad en el JSON.
- Hay otros textos visibles codificados en pantallas y modales, por ejemplo
  errores/confirmaciones en `setup-game.tsx` y `game.tsx`, ajustes, Power Cards,
  apuestas, duelos y diagnósticos.
- `expo-localization`, `i18next` y `react-i18next` ya están instalados.
  `react-native-reanimated` 4 y `react-native-worklets` también están instalados
  y son el mecanismo de animación nativo de Expo; no se necesita incorporar
  GSAP o Framer Motion para animar la app iOS/Android.

## Comportamiento deseado

- El cambio manual de idioma se aplica inmediatamente a toda la interfaz,
  incluidos textos de partida, alertas/feedback y contenidos de World Tour, y
  permanece seleccionado después de cerrar y volver a abrir la app.
- En el primer inicio sin preferencia guardada se usa el idioma del dispositivo
  si está soportado; para un idioma no soportado se usa inglés.
- Toda ciudad que pueda salir en una ruta tiene contenido completo en `es`,
  `en` y `pl`. El contenido se resuelve por `cityId` y por el idioma activo,
  no por idioma de la ruta ni por textos editoriales incrustados en el JSON
  estructural.
- El nombre propio oficial del venue/artista no se traduce cuando no
  corresponde; se localizan la ciudad cuando proceda, ubicación, narración,
  hechos, etiquetas, botones y textos de mecánicas.
- Las pantallas, mensajes, errores y estados visibles de Expo se sirven desde
  claves de traducción. No se traducen nombres de usuario, títulos de canciones
  o nombres propios recibidos como datos.
- La llegada al venue presenta una breve secuencia visual de partida con
  identidad de ciudad/venue, tipo de casilla y contenido; el Game Master puede
  continuar sin esperar la secuencia. La animación respeta la preferencia del
  sistema para reducir movimiento.
- Las traducciones y animaciones son presentación local. No se añade ni cambia
  ningún contrato HTTP, regla de juego, score, orden de ronda, ruta aleatoria o
  trigger de mecánica.

## Alcance

### Incluido

- Auditar e internacionalizar textos visibles restantes de Expo, incluidos
  textos de pantallas, botones, modales, alertas y feedback de partida.
- Mantener los tres idiomas ya expuestos: español, inglés y polaco.
- Persistir una selección manual de idioma en el dispositivo y mantener la
  detección del idioma del sistema como valor inicial.
- Completar el contenido de ciudades/venues/acts/tipos de casilla y hacer que
  el landing resuelva todo desde el locale activo.
- Añadir comprobaciones automatizadas de paridad de claves y cobertura de todos
  los city IDs de los pools.
- Dinamizar únicamente el evento de llegada al venue en esta primera entrega,
  usando React Native Reanimated ya instalado y respetando Reduced Motion.
- Actualizar `hitback/docs/WORLD_TOUR.md` y documentación i18n directamente
  relacionada.

### No incluido

- Cambios del backend, API, traducción dinámica o descarga remota de recursos.
- Agregar idiomas nuevos.
- Cambiar reglas, scoring, mecánicas de ciudades o generación de rutas.
- Instalar GSAP/Framer Motion para la app nativa cuando Reanimated ya cubre
  iOS/Android.
- Animar todos los efectos de la partida; esta fase se limita a la llegada al
  venue.

## Datos y ownership

| Dato | Owner | Alcance | Persistencia/ciclo |
| ---- | ----- | ------- | ------------------ |
| Idioma seleccionado | Expo | Instalación local | Preferencia persistente; detección del sistema solo en primera selección |
| IDs, orden y tipo de tiles de una ruta | Expo | Partida/jugador local | Zustand en memoria; no cambia |
| Traducciones de interfaz y venue | Expo | Recursos estáticos de la app | Empaquetados por idioma |
| Estado visual de la secuencia de llegada | Expo | Evento de aterrizaje actual | Efímero; no se envía al backend |
| Score, ronda y resolución de mecánicas | Backend | Sesión/jugador | Sin cambios |

## API y contratos

Sin cambios HTTP. El idioma no se envía al backend: World Tour, sus textos y
las animaciones pertenecen al cliente. Los identificadores de ciudad/venue
permanecen estables y sirven de clave para resolver su contenido localizado.

## Criterios de aceptación

- [x] Si el idioma guardado es `es`, `en` o `pl`, ese idioma se restaura al
  reiniciar la app, aunque el idioma del dispositivo sea distinto.
- [x] Sin preferencia guardada, se selecciona el idioma del dispositivo cuando
  es `es`, `en` o `pl`; para cualquier otro idioma, se selecciona `en`.
- [x] Cambiar idioma mientras se muestra una llegada actualiza ciudad, venue,
  historia, dato, tipo de casilla, mecánica y controles sin regenerar la ruta.
- [x] Las 58 ciudades sorteables disponen en los tres idiomas de `city`,
  `country`, `venue`, `story` y `realFact` no vacíos; ningún locale
  contiene IDs de ciudad obsoletos.
- [x] Una prueba de paridad informa todos los locales con las mismas claves
  requeridas y falla si falta un city ID o un campo traducido.
- [ ] Los textos visibles en los flujos incluidos se localizan desde recursos
  i18next; los datos dinámicos se interpolan, no se traducen ni concatenan como
  frases fijas.
- [ ] La llegada al venue muestra una secuencia visual coherente en iOS y
  Android; continuar está disponible inmediatamente y no altera ronda, score,
  trigger ni transición existente.
- [x] Con Reduce Motion activo, no se reproducen desplazamientos, escalados ni
  secuencias prolongadas; el contenido y las acciones siguen disponibles.
- [x] No se introduce un nuevo paquete de animación si la aprobación mantiene
  Reanimated como opción.

## Plan de pruebas

### Automatizadas

- Expo: test de selección/restauración/fallback de idioma con almacenamiento
  simulado y sin dependencia del idioma real del dispositivo (pendiente).
- Expo: `npm run test:tour-locales` compara los IDs de los pools con los tres
  locales y valida campos, claves y valores requeridos; también comprueba el
  fallback de inglés de i18next.
- Expo: test de resolución del landing por city ID/idioma, incluido fallback
  de inglés para una clave ausente en runtime (pendiente; `fallbackLng: 'en'`
  está configurado en i18next).
- Expo: `./node_modules/.bin/tsc --noEmit`; lint enfocado o lint general,
  registrando fallos preexistentes.
- Sin pruebas de API: no se modifica contrato ni estado backend.

### Manual/dispositivo

- Cambiar idioma en Ajustes, navegar a pantallas principales y a una ciudad;
  cerrar y volver a abrir, verificando persistencia.
- Comprobar un idioma de sistema no soportado y fallback a inglés.
- Recorrer ciudades faltantes actuales en los tres idiomas, incluidos textos
  largos en pantalla pequeña.
- Comprobar llegada y botón de continuar en iOS y Android; repetir con Reduce
  Motion habilitado.

## Plan de implementación

- [x] Confirmar persistencia local y estrategia de animación de llegada.
- [x] Añadir almacenamiento local de preferencia e inicialización de i18next
  que espere la preferencia antes de renderizar contenido traducido.
- [x] Separar el contenido editorial de los campos estructurales de ciudad y
  completar recursos `es/en/pl` para todos los city IDs y campos.
- [ ] Migrar textos visibles restantes de todas las pantallas, alertas,
  feedback y diagnósticos a claves locales y verificar paridad.
- [x] Actualizar `TourLandingModal` con resolución por locale y animación
  accesible con Reanimated.
- [x] Añadir test de integridad, actualizar documentación y registrar checks;
  falta QA manual en dispositivo.

## Decisiones aprobadas

- Traducir toda la interfaz visible de Expo, incluidos flujos utilitarios y de
  diagnóstico.
- Guardar la selección manual de idioma en el dispositivo; usar el idioma del
  sistema solo si todavía no existe una preferencia.
- Usar React Native Reanimated ya instalado para una entrada breve de venue
  tipo escenario/spotlight, con acción inmediata para continuar y soporte de
  Reduce Motion. No añadir GSAP ni Framer Motion.
- Mantener los tres idiomas actuales: español, inglés y polaco.

## Riesgos restantes

- La migración de textos visibles de toda la app a i18next sigue pendiente.
- No se ha revisado editorialmente el contenido traducido ni probado en
  dispositivo el cambio de idioma, la persistencia o Reduce Motion.
- No hay prueba automatizada directa de restauración del idioma ni del fallback
  en runtime cuando falta una clave.

## Resultados de verificación

| Comando/comprobación | Resultado | Notas |
| -------------------- | --------- | ----- |
| Auditoría de locale JSON | Correcto estructuralmente | 335 claves hoja por idioma; mismos paths en `es/en/pl` |
| `npm run test:tour-locales` | Correcto | 3 pruebas: cobertura de 58 IDs, paridad de claves y fallback inglés |
| `npx tsc --noEmit` | Correcto | Ejecutado desde `hitback/` |
| ESLint focalizado | Correcto con warnings | 0 errores; 7 avisos en imports, deps y variables no usados |
| `git diff --check` | Correcto | Sin errores de whitespace |
| QA manual iOS/Android | Pendiente | No se ejecutó en dispositivo |
| Auditoría de llamadas `useTranslation` | Cobertura parcial | Migración general de textos visibles pendiente |
| Auditoría de animación Expo | Reutilizable | Reanimated 4 y Worklets ya instalados |
