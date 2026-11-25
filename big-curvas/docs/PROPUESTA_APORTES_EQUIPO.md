# Propuesta: aportes visibles de todo el equipo en Git

> Estado: **propuesta**, todavía no ejecutada. La rúbrica de la Fase 3 evalúa el uso de Git y pide aportes visibles de todos los integrantes. Esta nota explica cómo lograrlo con trabajo real y desde las cuentas de cada persona.

## Principios

- Cada integrante sube **sus propios documentos y cambios desde su cuenta de GitHub**. Nadie hace commits en nombre de otra persona, no se cambia la autoría y no se reescribe el historial.
- Todo entra por **pull request** (PR) a `feature/demo`, con **una revisión de otro integrante** antes de fusionar. Así quedan visibles tanto el aporte como la revisión.
- Los commits siguen el formato *Conventional Commits* (por ejemplo `docs(fase3): diario de reflexión 3.1 de Renato Espina`).

## Antes de empezar (una vez por persona)

1. **Correo de los commits:** el correo de `git config user.email` debe estar agregado y verificado en *GitHub → Settings → Emails*. Si no, los commits no aparecen en el perfil ni en el gráfico de contribuciones.
2. **Nombre:** `git config user.name` con el nombre real.
3. Tener acceso de escritura al repositorio (Renato y Benjamín ya son colaboradores).

## Cómo subir un documento de la Fase 3

1. Crear una rama corta desde `feature/demo`, por ejemplo `docs/fase3-diario-renato` o `docs/fase3-autoeval-benjamin`.
2. Agregar el archivo en `Fase 3/Evidencias individuales/` con el nombre de la convención (ver el README: `Apellido_Nombre_3.1_APT122_DiarioReflexionFase3.docx`).
3. Si el archivo `borrar luego` de esa carpeta ya no hace falta, eliminarlo en el mismo PR.
4. Abrir el PR hacia `feature/demo` y pedir revisión a otro integrante. Se fusiona con *Create a merge commit*.

Sin Git instalado también sirve la web de GitHub: *Add file → Upload files → Create a new branch and start a pull request*.

## Tareas sugeridas según el rol

Cada tarea se crea como *Issue* y la cierra quien la hace con su propio PR.

| Integrante | Rol en el proyecto | Tareas posibles |
|------------|--------------------|-----------------|
| Renato Espina | QA, pruebas y certificación, validación de devoluciones y cambios | Ejecutar la lista de pruebas manuales de `DEMO_PLAN.md` en la demo publicada y registrar los resultados; redactar el acta de validación de las reglas de devoluciones con Belén (P-09, P-16, P-17, P-22); subir su diario 3.1 y su autoevaluación 3.2 |
| Benjamín Rojas | Dashboards y reportes de ventas | Validar con Belén qué reportes quiere ver (P-24) y dejar el acta; documentar con capturas cada reporte de la demo; revisar la coherencia de las cifras con los datos de ejemplo; subir su diario 3.1 y su autoevaluación 3.2 |
| Martín Osorio | Líder, arquitectura y backend | Subir su diario 3.1 y su autoevaluación 3.2; revisar los PR de los demás; mantener el plan de trabajo |

Si alguna tarea la hacen dos personas juntas, el commit puede llevar la línea `Co-authored-by:` con el nombre y el correo de la otra persona, **solo si ambas trabajaron de verdad en ese cambio y están de acuerdo**.

## Revisión cruzada

- Cada PR lo revisa alguien distinto de quien lo abrió (comentarios y aprobación en GitHub).
- Los comentarios de revisión y las aprobaciones también quedan como actividad visible de cada integrante.

## Qué no se hace

- Subir archivos con la cuenta de otra persona, ni "prestar" credenciales.
- Modificar la autoría de commits existentes ni reescribir el historial (`rebase` de ramas compartidas, `push --force`).
- Crear commits o PR sin contenido real solo para sumar cantidad.

## Pendiente de decisión

- Si conviene **proteger la rama por defecto** exigiendo una revisión antes de fusionar. Quedó fuera por ahora.
