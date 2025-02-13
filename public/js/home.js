// home.js
const firebaseConfig = {
    apiKey: "AIzaSyAR24CQPymO-X5-6L-JeKRGfyqXm3n8MOs",
    authDomain: "totob12-loco.firebaseapp.com",
    projectId: "totob12-loco",
    storageBucket: "totob12-loco.firebasestorage.app",
    messagingSenderId: "1079141322842",
    appId: "1:1079141322842:web:ea9606c2ad097ea3f30863"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

auth.onAuthStateChanged(user => {
    if (user) {
        // Retrieve the user's last position from Firebase Realtime Database
        const userRef = db.ref('users/' + user.uid);
        userRef.once('value').then(snapshot => {
            const data = snapshot.val();
            if (data && data.firstName) {
                document.getElementById('userName').textContent = data.firstName;
            } else {
                document.getElementById('userName').textContent = user.email;
            }
            if (data && data.location) {
                const lat = data.location.latitude || 'N/A';
                const lng = data.location.longitude || 'N/A';
                document.getElementById('userPosition').textContent = `Latitude: ${lat}, Longitude: ${lng}`;
            } else {
                document.getElementById('userPosition').textContent = 'No location data available.';
            }
            // Hide loader after data has loaded
            hideLoader();
        }).catch(error => {
            console.error("Error fetching user data:", error);
            document.getElementById('userPosition').textContent = 'Error fetching data.';
            hideLoader();
        });
    } else {
        // Hide loader and redirect to login if not authenticated
        hideLoader();
        window.location.href = "login";
    }
});

document.getElementById('logoutButton').addEventListener('click', function () {
    auth.signOut().then(() => {
        window.location.href = "login";
    }).catch(error => {
        console.error("Error signing out:", error);
    });
});
