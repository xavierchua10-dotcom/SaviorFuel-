# Switching on SaviorFuel accounts

1. Firebase console -> Add project (e.g. "saviorfuel"). Analytics off is fine.
2. Project settings -> Your apps -> Web (</>) -> register app -> copy the `firebaseConfig` object.
3. Build -> Authentication -> Get started -> enable **Google** and **Email/Password**.
4. Authentication -> Settings -> Authorized domains -> add the domain the app is served from (e.g. `xavierchua10-dotcom.github.io`).
5. Build -> Firestore Database -> Create database (production mode) -> Rules tab -> paste `firebase/firestore.rules` -> Publish.
6. In `index.html`, set `var FIREBASE_CONFIG = { ...the object from step 2... };`. The web config is public by design; the rules protect the data.
