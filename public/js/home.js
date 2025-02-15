// home.js

// Initialize Firebase
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

// Global variables
let receivingUsersData = {};   // Data for users sharing with you
let receivingListeners = {};   // For attached realtime listeners
let map;                       // Global Mapbox map instance
let userMarkers = {};          // Mapping user IDs to marker objects
let selectedUser = null;       // The user currently shown in the sidebar
let selectedUserLastCoords = null; // Last coordinates we reverse geocoded for the selected user

// --- Utility Functions ---

// Convert degrees to radians
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Compute distance in miles between two lat/lng pairs (Haversine formula)
function getDistanceFromLatLonInMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth's radius in miles
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Compute a human-readable "time ago" string from a timestamp
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

// --- Map & Marker Functions ---

// Fly the map to a given user's location
function flyToUser(user) {
    if (user.location && user.location.latitude && user.location.longitude && map) {
        map.flyTo({ center: [user.location.longitude, user.location.latitude], zoom: 16 });
    }
}

// Update marker element content (avatar + name)
function updateMarkerContent(markerEl, user) {
    // Clear current content
    markerEl.innerHTML = '';

    // Create avatar container
    const avatarEl = document.createElement('div');
    avatarEl.className = 'marker-avatar';
    if (user.avatar && user.avatar.link) {
        const img = document.createElement('img');
        img.src = user.avatar.link;
        img.alt = user.firstName || 'Avatar';
        avatarEl.appendChild(img);
    } else {
        avatarEl.classList.add('default-avatar');
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'person_outline';
        avatarEl.appendChild(icon);
    }

    // Create name container
    const nameEl = document.createElement('div');
    nameEl.className = 'marker-name';
    nameEl.textContent = user.firstName || 'User';

    markerEl.appendChild(avatarEl);
    markerEl.appendChild(nameEl);
}

// Update (or add) markers for all users (current + those sharing with you)
function updateMarkers() {
    if (!map) return;
    const allUsers = {};
    const currentUser = auth.currentUser;
    if (currentUser && window.currentUserData && window.currentUserData.location) {
        allUsers[currentUser.uid] = window.currentUserData;
    }
    Object.keys(receivingUsersData).forEach(uid => {
        const user = receivingUsersData[uid];
        if (user && user.location) {
            allUsers[uid] = user;
        }
    });

    // Add/update markers for each user
    for (const uid in allUsers) {
        const user = allUsers[uid];
        if (user.location && user.location.latitude && user.location.longitude) {
            const coords = [user.location.longitude, user.location.latitude];
            if (userMarkers[uid]) {
                userMarkers[uid].setLngLat(coords);
                updateMarkerContent(userMarkers[uid].getElement(), user);
            } else {
                const markerEl = document.createElement('div');
                markerEl.className = 'marker-pill';
                updateMarkerContent(markerEl, user);
                markerEl.addEventListener('click', function () {
                    openUserInfoSidebar(user);
                });
                const marker = new mapboxgl.Marker(markerEl)
                    .setLngLat(coords)
                    .addTo(map);
                userMarkers[uid] = marker;
            }
        }
    }

    // Remove markers if their user data no longer exists
    for (const uid in userMarkers) {
        if (!allUsers[uid]) {
            userMarkers[uid].remove();
            delete userMarkers[uid];
        }
    }
}

// Initialize or fly the Mapbox map
function initMap(lng, lat) {
    if (!map) {
        mapboxgl.accessToken = 'pk.eyJ1IjoidG90b2IxMjE3IiwiYSI6ImNsbXo4NHdocjA4dnEya215cjY0aWJ1cGkifQ.OMzA6Q8VnHLHZP-P8ACBRw';
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/standard',
            attributionControl: false,
            center: [lng, lat],
            zoom: 16
        });
        map.addControl(new mapboxgl.NavigationControl());
    } else {
        map.flyTo({ center: [lng, lat], zoom: 16 });
    }
    updateMarkers();
}

// --- Realtime Listeners & Data Rendering ---

// Listen to users sharing with the current user
function subscribeToReceivingUsers(currentUserId) {
    const receivingFromRef = db.ref(`users/${currentUserId}/receivingFrom`);
    receivingFromRef.on('value', snapshot => {
        const receivingFrom = snapshot.val() || {};
        const uids = Object.keys(receivingFrom);

        // Remove listeners for users no longer sharing
        for (const uid in receivingListeners) {
            if (!uids.includes(uid)) {
                receivingListeners[uid]();
                delete receivingListeners[uid];
                delete receivingUsersData[uid];
            }
        }

        // Attach listeners for new sharing users
        uids.forEach(uid => {
            if (!receivingListeners[uid]) {
                const userRef = db.ref(`users/${uid}`);
                const listener = userRef.on('value', userSnapshot => {
                    const userData = userSnapshot.val();
                    if (userData) {
                        userData.uid = uid;
                        receivingUsersData[uid] = userData;
                        // If this user is currently selected in the sidebar, update its info
                        if (selectedUser && selectedUser.uid === uid) {
                            selectedUser = userData;
                            updateSelectedUserSidebar();
                        }
                        renderUserList();
                        updateMarkers();
                    }
                });
                receivingListeners[uid] = () => userRef.off('value', listener);
            }
        });

        renderUserList();
        updateMarkers();
    });
}

// Render the People list in the sidebar
function renderUserList() {
    const userListElement = document.getElementById('userList');
    if (!userListElement) return;
    userListElement.innerHTML = '';

    // Add current user ("You") at the top
    if (window.currentUserData) {
        const youItem = createUserListItem(window.currentUserData, true);
        userListElement.appendChild(youItem);
    }

    // Add other users sharing with you
    Object.values(receivingUsersData).forEach(user => {
        if (user) {
            const item = createUserListItem(user, false);
            userListElement.appendChild(item);
        }
    });
}

// Create a single user list item element with a timestamp data attribute
function createUserListItem(user, isCurrentUser) {
    const item = document.createElement('div');
    item.className = 'user-list-item';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'user-list-avatar';
    if (user.avatar && user.avatar.link) {
        avatar.style.backgroundImage = `url(${user.avatar.link})`;
    } else {
        avatar.style.backgroundColor = '#ccc';
        avatar.textContent = user.firstName ? user.firstName.charAt(0) : '';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.color = '#fff';
        avatar.style.fontWeight = 'bold';
    }

    // Details container
    const details = document.createElement('div');
    details.className = 'user-list-details';

    // User name
    const name = document.createElement('div');
    name.className = 'user-list-name';
    name.textContent = user.firstName ? user.firstName : (user.email || 'Unknown');
    if (isCurrentUser) {
        name.textContent += " (You)";
    }

    // Timestamp element with data attribute for real-time updating
    const timestamp = document.createElement('div');
    timestamp.className = 'user-list-timestamp';
    if (user.locationTimestamp) {
        timestamp.textContent = getTimeAgo(user.locationTimestamp);
        timestamp.setAttribute('data-timestamp', user.locationTimestamp);
    } else {
        timestamp.textContent = '';
    }

    details.appendChild(name);
    details.appendChild(timestamp);
    item.appendChild(avatar);
    item.appendChild(details);

    // Distance info for other users (if available)
    if (!isCurrentUser && window.currentUserData && window.currentUserData.location && user.location) {
        const distance = getDistanceFromLatLonInMiles(
            window.currentUserData.location.latitude,
            window.currentUserData.location.longitude,
            user.location.latitude,
            user.location.longitude
        );
        const distanceElement = document.createElement('div');
        distanceElement.className = 'user-list-distance';
        distanceElement.textContent = `${distance.toFixed(1)} mi`;
        item.appendChild(distanceElement);
    }

    // On click: fly to user and open the info sidebar
    item.addEventListener('click', () => {
        openUserInfoSidebar(user);
    });

    return item;
}

// --- User Info Sidebar Functions ---

// Open the sidebar and populate it with the selected user's info
function openUserInfoSidebar(user) {
    selectedUser = user;
    const fullName = ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.email || 'Unknown User';
    document.getElementById('selectedUserFullName').textContent = fullName;

    // Set placeholders
    document.getElementById('selectedUserAddress').textContent = 'Loading address...';
    document.getElementById('selectedUserTimeAgo').textContent = user.locationTimestamp ? getTimeAgo(user.locationTimestamp) : '--';

    // Fly to the user's location
    flyToUser(user);

    // Immediately update the sidebar details
    updateSelectedUserSidebar();

    // Open the sidebar overlay
    document.getElementById('userInfoSidebar').classList.add('open');
}

// Update the sidebar info for the selected user (address & last updated)
function updateSelectedUserSidebar() {
    if (!selectedUser) return;
    // Update "last updated" text
    document.getElementById('selectedUserTimeAgo').textContent = getTimeAgo(selectedUser.locationTimestamp);

    // If location data exists, update the address only if coordinates have changed
    if (selectedUser.location && selectedUser.location.latitude && selectedUser.location.longitude) {
        const newCoords = { lat: selectedUser.location.latitude, lng: selectedUser.location.longitude };
        if (!selectedUserLastCoords || selectedUserLastCoords.lat !== newCoords.lat || selectedUserLastCoords.lng !== newCoords.lng) {
            selectedUserLastCoords = newCoords;
            fetchReverseGeocode(newCoords.lat, newCoords.lng)
                .then(address => {
                    document.getElementById('selectedUserAddress').textContent = address;
                })
                .catch(error => {
                    console.error("Reverse geocode error:", error);
                    document.getElementById('selectedUserAddress').textContent = "Address not found";
                });
        }
    } else {
        document.getElementById('selectedUserAddress').textContent = "No location available";
    }
}

// Close the user info sidebar
function closeUserInfoSidebar() {
    document.getElementById('userInfoSidebar').classList.remove('open');
    selectedUser = null;
    selectedUserLastCoords = null;
}

// Reverse geocode using Nominatim OpenStreetMap API
async function fetchReverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Loco-App' } });
    if (!response.ok) {
        throw new Error("Failed to fetch reverse geocode");
    }
    const data = await response.json();
    return data.display_name || "Address not found";
}

// --- Timestamp Updater ---

// Update the timestamps in the People list by reading each element’s data attribute
function updateUserListTimestamps() {
    const timestampElements = document.querySelectorAll('.user-list-timestamp');
    timestampElements.forEach(el => {
        const ts = el.getAttribute('data-timestamp');
        if (ts) {
            el.textContent = getTimeAgo(parseInt(ts));
        }
    });
}

// Update both the People list and sidebar timestamps every second
setInterval(() => {
    updateUserListTimestamps();
    if (selectedUser) {
        updateSelectedUserSidebar();
    }
}, 1000);

// --- DOM Event Listeners ---

// Sidebar close button
document.getElementById('closeUserInfoSidebar').addEventListener('click', closeUserInfoSidebar);

// Logout button
document.getElementById('logoutButton').addEventListener('click', function () {
    auth.signOut().then(() => {
        window.location.href = "login";
    }).catch(error => {
        console.error("Error signing out:", error);
    });
});

// --- Firebase Auth & Current User Data ---

auth.onAuthStateChanged(user => {
    if (user) {
        // Listen to the current user's data in realtime
        const userRef = db.ref('users/' + user.uid);
        userRef.on('value', snapshot => {
            const data = snapshot.val() || {};
            data.uid = user.uid;
            if (!data.firstName) {
                data.firstName = user.email.split('@')[0];
            }
            document.getElementById('userName').textContent = data.firstName || user.email;
            window.currentUserData = data;
            if (data.location) {
                const lat = data.location.latitude;
                const lng = data.location.longitude;
                document.getElementById('userPosition').textContent = `Latitude: ${lat}, Longitude: ${lng}`;
                initMap(lng, lat);
            } else {
                document.getElementById('userPosition').textContent = 'No location data available.';
                initMap(-74.0060, 40.7128);
            }
            renderUserList();
            updateMarkers();
            hideLoader();
        });
        subscribeToReceivingUsers(user.uid);
    } else {
        hideLoader();
        window.location.href = "login";
    }
});
