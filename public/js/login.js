// login.js
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

document.getElementById('loginButton').addEventListener('click', function () {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = '';

    if (!email || !password) {
        errorDiv.textContent = 'Please fill in all fields.';
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Redirect to home page upon successful login
            window.location.href = "home";
        })
        .catch((error) => {
            errorDiv.textContent = error.message;
        });
});

// Redirect to home if already logged in
auth.onAuthStateChanged(user => {
    if (user) {
        window.location.href = "home";
    } else {
        hideLoader();
    }
});
