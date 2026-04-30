# LiveKit Meet — Django port

A Django port of [livekit/meet](https://github.com/livekit/meet) (originally a Next.js app).
Server-side endpoints are reimplemented in Django; the in-room UI uses the official
`livekit-client` JS SDK loaded from a CDN.

## Endpoints

| Path                              | Purpose                                             |
| --------------------------------- | --------------------------------------------------- |
| `/`                               | Home page (Demo / Custom tabs)                      |
| `/rooms/<room_name>/`             | Meeting room                                        |
| `/custom/?liveKitUrl=&token=`     | Manual server URL + token connection                |
| `/api/connection-details`         | Mints a LiveKit JWT for a room/participant          |
| `/api/record/start?roomName=`     | Starts an S3 egress recording for the room          |
| `/api/record/stop?roomName=`      | Stops any active egresses for the room              |

## Setup

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Copy `.env.example` to `.env.local` and fill in your LiveKit credentials:

```
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://your-project.livekit.cloud
```

## Run

```bash
python manage.py migrate
python manage.py runserver
```

Then open http://localhost:8000

## Recording (optional)

Recording uses LiveKit egress with S3 output. Fill in S3 credentials in
`.env.local`:

```
S3_KEY_ID=...
S3_KEY_SECRET=...
S3_ENDPOINT=...
S3_BUCKET=...
S3_REGION=...
RECORD_ENDPOINT=/api/record
```

Setting `RECORD_ENDPOINT` exposes a Record button in the room toolbar.

> **Caution:** like the original Next.js app, the recording endpoints are
> unauthenticated — anyone who knows a room name can start or stop recordings.
> Do not deploy as-is.

## Project layout

```
meet-django/
├── manage.py
├── requirements.txt
├── .env.example
├── meet/                # Django project package
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── core/                # Application
│   ├── views.py         # connection_details, record_start, record_stop, pages
│   ├── urls.py
│   ├── livekit_utils.py # random_string, generate_room_id, get_livekit_url
│   └── context_processors.py
├── templates/
│   ├── base.html
│   ├── home.html
│   ├── room.html
│   └── custom.html
└── static/
    ├── css/             # globals.css, home.css, room.css
    ├── js/              # home.js, room.js, custom.js
    ├── images/
    └── favicon.ico
```

## What is and isn't ported

**Ported**

- Token minting (`/api/connection-details`) including the `random-participant-postfix` cookie behavior, region rewriting, and 5-minute TTL
- Recording start/stop (`/api/record/start`, `/api/record/stop`) including the "already recording" 409 and "no active recording" 404 cases
- Home page with Demo / Custom tabs and E2EE passphrase handling
- Custom connection page (`/custom/`)
- Functional in-room UI: video grid, mic/cam toggles, leave

**Not ported (Next.js / React-only features)**

- The polished `@livekit/components-react` prebuilt UI (PreJoin component, fancy controls, settings menu with Krisp filters, debug panel, keyboard shortcuts)
- E2EE worker plumbing — the home page accepts a passphrase and passes it via URL fragment as the original did, but the Django front-end does not yet wire it to a LiveKit E2EE manager
- Datadog logging
- Jest tests

These were React/Next-specific. The Django port focuses on the server side plus a working vanilla-JS client.
