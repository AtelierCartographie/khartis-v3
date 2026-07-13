# Analytics (Google Tag Manager)

Khartis measures audience and feature adoption only after Cookiebot reports that
the user has accepted statistics cookies. The application pushes anonymous
event names and a small, allow-listed set of categorical parameters to the
Sciences Po Google Tag Manager container. It never sends project names, file
names, data values, column names, place names, imported file contents, or error
messages.

**See also**: [README.md](README.md) | [GESTION_ETAT.md](GESTION_ETAT.md)

---

## Application behavior

Khartis loads the Sciences Po **Google Tag Manager** container at application
startup and pushes anonymous, allow-listed events to `window.dataLayer`. GA4,
Cookiebot, Consent Mode, and cookie cleanup are configured **inside GTM by
Sciences Po**, not by Khartis. The container ID comes only from
`PUBLIC_GTM_CONTAINER_ID`; nothing is hard-coded in the repository.

Loading the container is independent from analytics consent so the institutional
Cookiebot configuration can run. Khartis listens for
`CookiebotOnConsentReady`, `CookiebotOnAccept`, and `CookiebotOnDecline`, and
reads `Cookiebot.consent.statistics` as its only consent source. It pushes no
custom analytics event before statistics consent. Refusal or withdrawal clears
the local event queue and removes the application's global error listeners.
Cookiebot remains responsible for Consent Mode, consent persistence, and cookies.

## Implementation map

| Responsibility                    | Source of truth                                                                               | Behavior                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Consent bridge                    | `cookiebot-consent.service.ts`, `cookiebot-consent.svelte`                                    | Observes Cookiebot's statistics consent, gates custom events, and delegates the preferences UI to `Cookiebot.renew()`.                    |
| GTM transport and minimization    | `src/lib/features/commons/services/analytics.service.ts`                                      | Loads GTM at startup, sanitizes page variables, and allow-lists custom events and parameters. It does not manage Consent Mode or cookies. |
| Project and data lifecycle        | `project-lifecycle.ts`, `open-project.svelte`, `project-name.svelte`, `add-data-modal.svelte` | Records only workflow outcomes and coarse file metadata.                                                                                  |
| Visualization and export adoption | `visualization.store.svelte.ts`, `use-export-modal.svelte.ts`                                 | Records visualization type and export format or resolution from fixed value lists.                                                        |
| Error signals                     | `analytics.service.ts` and workflow error handlers                                            | Records source, error class, and fatality only. It never sends an error message, stack trace, project name, or user data.                 |

Every source above calls the service, never `gtag` directly. The service rejects
event names and parameters outside its explicit allow lists. This keeps the
event contract reviewable and prevents accidental collection when a workflow is
changed later.

The client pushes these events to `window.dataLayer` after consent (a GTM
custom-event trigger can fire on each `event` value):

| Event                   | Purpose                                              | Parameters                                            |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `app_opened`            | App session entered                                  | None                                                  |
| `project_created`       | Project successfully created                         | `source_type`, `file_type`, `file_count`              |
| `project_opened`        | Local project or backup opened                       | `open_source`                                         |
| `data_import_completed` | Data added to an existing project                    | `source_type`, `file_type`, `file_count`              |
| `visualization_created` | Visualization created                                | `visualization_type`                                  |
| `export_completed`      | Project, map, or data export completed               | `export_target`, `export_format`, `export_resolution` |
| `app_error`             | A tracked workflow failure or uncaught browser error | `error_source`, `error_type`, `fatal`                 |

At bootstrap, `page_location` and `page_referrer` are limited to the origin and
path and pushed as dataLayer variables with `page_path` and `page_title`. Query
strings and URL fragments are never added by Khartis because they can contain
shared-project information. Configure the GA4 page-view tag in GTM to read these
dataLayer variables rather than the raw browser URL.

The Sciences Po container already supplies standard events such as `page_view`,
`session_start`, `scroll`, and consent events. Khartis does not push duplicates.
Review enhanced measurement in the GA4 property and disable any automatic
measurement that is not necessary for the stated analytics purpose.

Google Analytics 4 automatically provides users, sessions, first visits, user
engagement, and retention once its Google tag receives these events. The custom
events above explain feature adoption and pinpoint the workflow where failures
occur. They are usage signals, not a replacement for a dedicated error reporting
service with diagnostic logs.

---

## GTM configuration

Khartis loads a Google Tag Manager container. Set `PUBLIC_GTM_CONTAINER_ID`
(for example `GTM-XXXXXX`) in the public build environment. The local deploy
helper sets it per target (`KHARTIS_GTM_CONTAINER_ID_PROD` for prod,
`KHARTIS_GTM_CONTAINER_ID_PPRD` for pprd); leaving the pprd one empty ships
pre-production without analytics so test traffic never reaches the prod property. A container ID is public configuration,
not a credential. Never add an API secret or another credential to the
application or repository, and never hard-code the ID in the source.

Sciences Po owns and configures the container and Cookiebot. The institutional
configuration must:

- a **GA4 Configuration** tag with the destination GA4 measurement ID;
- one **GA4 Event** tag per event (or a generic parameterised one), fired by a
  **Custom Event** trigger matching each `event` name from the table above;
- **Data Layer Variables** for each parameter (`source_type`, `file_type`,
  `file_count`, `open_source`, `visualization_type`, `export_target`,
  `export_format`, `export_resolution`, `error_source`, `error_type`, `fatal`,
  `page_location`, `page_path`, `page_referrer`, `page_title`);
- use Cookiebot as the only consent owner and update Consent Mode from its
  statistics category;
- disable the floating Cookiebot privacy trigger with
  `data-widget-enabled="false"` when injecting the Cookiebot script. Khartis also
  hides `#CookiebotWidget` as a defensive fallback;
- expose the Cookiebot API on `window.Cookiebot` so the side navigation can call
  `Cookiebot.renew()`.

Privacy is a shared responsibility: the container must route these events to
**GA4 only** (no advertising tags), keep `ad_storage` / `ad_user_data` /
`ad_personalization` denied, and avoid a second consent implementation. See
issue #235.

After a production deployment, use GTM Preview and GA4 DebugView to verify each
custom event fires exactly once after acceptance. Refuse analytics or withdraw
it from the side navigation and confirm Khartis emits no further custom events.
Also verify that the side-navigation control opens Cookiebot and that the
floating widget remains hidden.

## Legal release checklist

The implementation covers the technical consent controls. The controller must
complete this checklist before production release with its data-protection
officer or legal team:

- Publish an information notice that names Sciences Po as controller, names
  Google Analytics as the audience-measurement provider, states the purpose,
  retention period, data recipients and international-transfer information, and
  explains data-subject rights and the DPO contact.
- Review the GA4 property settings: data retention, data sharing, Google
  signals, advertising features, cross-device reporting and every enhanced
  measurement event. Disable settings that are not necessary for the declared
  audience-measurement purpose.
- Confirm the appropriate Google contractual terms and transfer safeguards for
  the controller, and keep the record of processing and consent evidence.
- Validate the published service in GA4 DebugView and with a fresh browser
  profile for acceptance, refusal and withdrawal.

This checklist is intentionally operational: repository code cannot determine
the controller's retention choice, contractual terms or production GA4 property
settings.

## Custom dimensions

Register only the parameters needed in reports as event-scoped custom dimensions:

- `file_count` is numeric, the other parameters are text or boolean.
- Do not register, collect, or derive arbitrary event values.
- The events themselves appear automatically in GA4. Dimensions affect reporting,
  not event collection.

---

## Reporting baseline

Use GA4 standard reports for active users, new users, sessions, engagement, and
retention. Build an exploration with `project_created`,
`data_import_completed`, `visualization_created`, and `export_completed` as a
feature-adoption funnel. Monitor `app_error` by `error_source` and `error_type`
to identify failing workflows without collecting diagnostic content from user
projects.
