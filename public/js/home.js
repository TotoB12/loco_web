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

let receivingUsersData = {};   // Will hold data for users sharing with you
let receivingListeners = {};   // To keep track of attached listeners

// Function to subscribe to users sharing with you
function subscribeToReceivingUsers(currentUserId) {
    const receivingFromRef = db.ref(`users/${currentUserId}/receivingFrom`);
    receivingFromRef.on('value', snapshot => {
        const receivingFrom = snapshot.val() || {};
        const uids = Object.keys(receivingFrom);

        // Remove listeners for uids that are no longer in the receiving list
        for (const uid in receivingListeners) {
            if (!uids.includes(uid)) {
                receivingListeners[uid]();
                delete receivingListeners[uid];
                delete receivingUsersData[uid];
            }
        }

        // For each uid in receivingFrom, attach listener if not already attached
        uids.forEach(uid => {
            if (!receivingListeners[uid]) {
                const userRef = db.ref(`users/${uid}`);
                const listener = userRef.on('value', userSnapshot => {
                    const userData = userSnapshot.val();
                    if (userData) {
                        userData.uid = uid;
                        receivingUsersData[uid] = userData;
                        renderUserList();
                    }
                });
                // Save a function to remove this listener later
                receivingListeners[uid] = () => userRef.off('value', listener);
            }
        });

        // Render user list after updating listeners
        renderUserList();
    });
}

// Render the sidebar user list (People)
function renderUserList() {
    const userListElement = document.getElementById('userList');
    if (!userListElement) return;
    userListElement.innerHTML = ''; // Clear existing list

    // Add current user ("You") at the top
    if (window.currentUserData) {
        const youItem = createUserListItem(window.currentUserData, true);
        userListElement.appendChild(youItem);
    }

    // Add other users from receivingUsersData
    Object.values(receivingUsersData).forEach(user => {
        if (user) {
            const item = createUserListItem(user, false);
            userListElement.appendChild(item);
        }
    });
}

// Create a single user list item element
function createUserListItem(user, isCurrentUser) {
    const item = document.createElement('div');
    item.className = 'user-list-item';

    // Create avatar element
    const avatar = document.createElement('div');
    avatar.className = 'user-list-avatar';
    if (user.avatar && user.avatar.link) {
        avatar.style.backgroundImage = `url(${user.avatar.link})`;
    } else {
        // Fallback: show a colored circle with the initial (if available)
        avatar.style.backgroundColor = '#ccc';
        avatar.textContent = user.firstName ? user.firstName.charAt(0) : '';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.color = '#fff';
        avatar.style.fontWeight = 'bold';
    }

    // Create details container
    const details = document.createElement('div');
    details.className = 'user-list-details';

    // User name (append "(You)" if current user)
    const name = document.createElement('div');
    name.className = 'user-list-name';
    name.textContent = user.firstName ? user.firstName : (user.email || 'Unknown');
    if (isCurrentUser) {
        name.textContent += " (You)";
    }

    // Timestamp showing when the location was last updated
    const timestamp = document.createElement('div');
    timestamp.className = 'user-list-timestamp';
    if (user.locationTimestamp) {
        timestamp.textContent = getTimeAgo(user.locationTimestamp);
    } else {
        timestamp.textContent = '';
    }

    details.appendChild(name);
    details.appendChild(timestamp);

    item.appendChild(avatar);
    item.appendChild(details);

    // When clicking on a list item, center the map on that user's location (if available)
    item.addEventListener('click', () => {
        if (user.location && user.location.longitude && user.location.latitude) {
            initMap(user.location.longitude, user.location.latitude);
        }
    });

    return item;
}

// Utility: Compute a "time ago" string given a timestamp
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diffInSeconds = Math.floor((now - timestamp) / 1000);
    if (diffInSeconds < 60) return diffInSeconds + ' sec ago';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return diffInMinutes + ' min ago';
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return diffInHours + ' hr ago';
    const diffInDays = Math.floor(diffInHours / 24);
    return diffInDays + ' day' + (diffInDays > 1 ? 's' : '') + ' ago';
}

// Existing authentication listener and map initialization
auth.onAuthStateChanged(user => {
    if (user) {
        // Retrieve the user's last position from Firebase Realtime Database
        const userRef = db.ref('users/' + user.uid);
        userRef
            .once('value')
            .then(snapshot => {
                const data = snapshot.val();

                // Set user's name (or fallback to email)
                if (data && data.firstName) {
                    document.getElementById('userName').textContent = data.firstName;
                } else {
                    document.getElementById('userName').textContent = user.email;
                }

                // Set last known location & initialize map
                if (data && data.location) {
                    const lat = data.location.latitude || 'N/A';
                    const lng = data.location.longitude || 'N/A';
                    document.getElementById('userPosition').textContent = `Latitude: ${lat}, Longitude: ${lng}`;
                    initMap(lng, lat); // Mapbox expects [lng, lat]
                } else {
                    document.getElementById('userPosition').textContent = 'No location data available.';
                    // Default location (e.g., New York City)
                    initMap(-74.0060, 40.7128);
                }
                // Hide loader after data has loaded
                hideLoader();

                // Store current user data globally for the "You" entry
                window.currentUserData = data;
            })
            .catch(error => {
                console.error("Error fetching user data:", error);
                document.getElementById('userPosition').textContent = 'Error fetching data.';
                hideLoader();
                // Initialize map with default location in case of error
                initMap(-74.0060, 40.7128);
            });

        // Subscribe to the "receivingFrom" list so we know who’s sharing with you
        subscribeToReceivingUsers(user.uid);
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

// Function to initialize the Mapbox map (unchanged)
function initMap(lng, lat) {
    // Set your Mapbox access token
    mapboxgl.accessToken = 'pk.eyJ1IjoidG90b2IxMjE3IiwiYSI6ImNsbXo4NHdocjA4dnEya215cjY0aWJ1cGkifQ.OMzA6Q8VnHLHZP-P8ACBRw';
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/standard',
        config:
        {
            basemap: {
                show3dObjects: false
            }
        },
        center: [lng, lat],
        zoom: 16
    });

    // Add zoom and rotation controls to the map
    map.addControl(new mapboxgl.NavigationControl());

    // Add a marker at the user's location
    new mapboxgl.Marker()
        .setLngLat([lng, lat])
        .addTo(map);
}
