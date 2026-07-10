# Analytics and Google Analytics 4

Khartis measures audience and feature adoption only after the user has accepted
audience analytics. The application sends anonymous event names and a small,
allow-listed set of categorical parameters to Google Analytics 4. It never sends
project names, file names, data values, column names, place names, imported file
contents, or error messages.

**See also**: [README.md](README.md) | [GESTION_ETAT.md](GESTION_ETAT.md)

---

## Application behavior

Khartis uses a direct GA4 `gtag.js` integration. It does not load a Google Tag
Manager container.

The consent store is the only application entry point that enables analytics.
On a fresh refusal, the Google tag is not injected and no analytics event is
queued. When consent is granted, the client applies Consent Mode with every
storage category denied, disables automatic page views, then grants only
`analytics_storage`. On refusal or withdrawal it updates Consent Mode to denied,
clears queued events, removes GA cookies visible to the current domain, and
removes its global error listeners. If GA4 had already been loaded in the
current page, the script can remain loaded until refresh, but Khartis no longer
sends events and a fresh page load starts without the script.

## Implementation map

| Responsibility                       | Source of truth                                                                               | Behavior                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consent persistence and startup gate | `src/lib/features/commons/stores/consent.store.svelte.ts`                                     | Restores only the current consent version and calls `analyticsService.enable()` only when analytics was accepted.                                           |
| User control                         | `src/lib/features/side-nav/components/data-privacy-modal.svelte`                              | Lets users accept or decline audience analytics again from the side navigation.                                                                             |
| GA4 transport and minimization       | `src/lib/features/commons/services/analytics.service.ts`                                      | Loads `gtag.js` after consent, applies Consent Mode, sanitizes URL/referrer values, allow-lists events and parameters, and clears GA cookies on withdrawal. |
| Project and data lifecycle           | `project-lifecycle.ts`, `open-project.svelte`, `project-name.svelte`, `add-data-modal.svelte` | Records only workflow outcomes and coarse file metadata.                                                                                                    |
| Visualization and export adoption    | `visualization.store.svelte.ts`, `use-export-modal.svelte.ts`                                 | Records visualization type and export format or resolution from fixed value lists.                                                                          |
| Error signals                        | `analytics.service.ts` and workflow error handlers                                            | Records source, error class, and fatality only. It never sends an error message, stack trace, project name, or user data.                                   |

Every source above calls the service, never `gtag` directly. The service rejects
event names and parameters outside its explicit allow lists. This keeps the
event contract reviewable and prevents accidental collection when a workflow is
changed later.

The client sends these GA4 events after consent:

| Event                      | Purpose                                              | Parameters                                                  |
| -------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `page_view`                | Anonymous app view                                   | `page_location`, `page_path`, `page_referrer`, `page_title` |
| `app_opened`               | App session entered                                  | None                                                        |
| `project_created`          | Project successfully created                         | `source_type`, `file_type`, `file_count`                    |
| `project_opened`           | Local project or backup opened                       | `open_source`                                               |
| `data_import_completed`    | Data added to an existing project                    | `source_type`, `file_type`, `file_count`                    |
| `visualization_created`    | Visualization created                                | `visualization_type`                                        |
| `export_completed`         | Project, map, or data export completed               | `export_target`, `export_format`, `export_resolution`       |
| `app_error`                | A tracked workflow failure or uncaught browser error | `error_source`, `error_type`, `fatal`                       |
| `analytics_consent_accept` | Audience analytics accepted                          | None                                                        |

`page_location` and `page_referrer` are limited to the origin and path. Query
strings and URL fragments are never added by Khartis because they can contain
shared-project information. Khartis sets an empty referrer explicitly when it
has none, so GA4 does not fall back to the browser's unsanitized referrer.

The GA4 data stream can also emit standard enhanced-measurement events, such as
`scroll`, after consent. Review that setting in the GA4 property and disable any
automatic measurement that is not necessary for the stated analytics purpose.

Google Analytics 4 automatically provides users, sessions, first visits, user
engagement, and retention once its Google tag receives these events. The custom
events above explain feature adoption and pinpoint the workflow where failures
occur. They are usage signals, not a replacement for a dedicated error reporting
service with diagnostic logs.

---

## GA4 configuration

The official Sciences Po production URL uses the published Khartis GA4
measurement ID. For another deployment, set `PUBLIC_GA_MEASUREMENT_ID` in its
public build environment. A measurement ID is public configuration, not a
credential. Never add an API secret or another credential to the application or
repository.

GA4 receives the listed custom events directly. Register the parameters needed
in reports as event-scoped custom dimensions. `file_count` is numeric, the other
parameters are text or boolean. Do not register, collect, or derive arbitrary
event values.

After a production deployment, use GA4 DebugView to verify each event is
received exactly once after acceptance. Refuse analytics or withdraw it from the
side navigation and confirm no further GA4 requests or events are emitted.

`send_page_view` remains disabled in the client so that Khartis sends one manual
page view with safe location and referrer values. Query strings and fragments
are excluded before the event is queued.

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
