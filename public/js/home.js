// home.js

// Your existing firebase configuration and initialization remain unchanged.
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

// <<< NEW: Global map instance and markers dictionary >>>
let map; // Global Mapbox map instance
let userMarkers = {}; // Dictionary mapping user IDs to marker objects

// <<< NEW: Variables for the user info sidebar >>>
let selectedUser = null;
const userInfoSidebar = document.getElementById('userInfoSidebar');
const closeUserInfoSidebarBtn = document.getElementById('closeUserInfoSidebar');
const selectedUserFullNameEl = document.getElementById('selectedUserFullName');
const selectedUserAddressEl = document.getElementById('selectedUserAddress');
const selectedUserTimeAgoEl = document.getElementById('selectedUserTimeAgo');

// Utility: Convert degrees to radians
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Utility: Compute distance in miles using the haversine formula
function getDistanceFromLatLonInMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of the earth in miles
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// >>> NEW: Function to fly (zoom) to a user’s location on the map
function flyToUser(user) {
    if (user.location && user.location.latitude && user.location.longitude && map) {
        map.flyTo({ center: [user.location.longitude, user.location.latitude], zoom: 16 });
    }
}

// NEW: Helper function to update a marker element’s content
function updateMarkerContent(markerEl, user) {
    // Clear existing content
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
        // Use a default avatar with Material icon
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

    // Append avatar and name to the marker element
    markerEl.appendChild(avatarEl);
    markerEl.appendChild(nameEl);
}

// >>> NEW: Updated marker creation and update in updateMarkers()
function updateMarkers() {
    if (!map) return;
    // Combine current user and users sharing with you
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

    // For each user, add or update marker
    for (const uid in allUsers) {
        const user = allUsers[uid];
        if (user.location && user.location.latitude && user.location.longitude) {
            const coords = [user.location.longitude, user.location.latitude];
            if (userMarkers[uid]) {
                // Update marker position
                userMarkers[uid].setLngLat(coords);
                // Update marker content in case user details have changed
                const markerEl = userMarkers[uid].getElement();
                updateMarkerContent(markerEl, user);
            } else {
                // Create a new marker element
                const markerEl = document.createElement('div');
                markerEl.className = 'marker-pill';
                updateMarkerContent(markerEl, user);
                // When clicking the marker, fly to the user’s location and open the user info sidebar
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

    // Remove markers that no longer have corresponding user data
    for (const uid in userMarkers) {
        if (!allUsers[uid]) {
            userMarkers[uid].remove();
            delete userMarkers[uid];
        }
    }
}

// >>> MODIFIED: Initialize (or update) the Mapbox map
function initMap(lng, lat) {
    // If map is not already created, create it
    if (!map) {
        mapboxgl.accessToken = 'pk.eyJ1IjoidG90b2IxMjE3IiwiYSI6ImNsbXo4NHdocjA4dnEya215cjY0aWJ1cGkifQ.OMzA6Q8VnHLHZP-P8ACBRw';
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/standard',
            attributionControl: false, // Remove Mapbox attribution
            center: [lng, lat],
            zoom: 16
        });
        // Add zoom and rotation controls to the map
        map.addControl(new mapboxgl.NavigationControl());
    } else {
        // If the map already exists, fly to the new coordinates
        map.flyTo({ center: [lng, lat], zoom: 16 });
    }
    // Update markers after (re)initializing the map
    updateMarkers();
}

// Subscribe to users sharing with you
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
                        updateMarkers(); // update markers when data changes
                    }
                });
                // Save a function to remove this listener later
                receivingListeners[uid] = () => userRef.off('value', listener);
            }
        });

        // Render user list after updating listeners and markers
        renderUserList();
        updateMarkers();
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

    // Add distance (if not current user and if both locations are available)
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

    // <<< MODIFIED: When clicking on a list item, fly the map to that user's location and open the user info sidebar >>>
    item.addEventListener('click', () => {
        openUserInfoSidebar(user);
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

/* >>> NEW: Functions for the User Info Sidebar */

// Opens the sidebar and populates it with the selected user's info
function openUserInfoSidebar(user) {
    selectedUser = user;
    // Update full name (concatenating first and last names if available)
    const fullName = ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.email || 'Unknown User';
    selectedUserFullNameEl.textContent = fullName;

    // Set initial placeholder for address and time
    selectedUserAddressEl.textContent = 'Loading address...';
    selectedUserTimeAgoEl.textContent = user.locationTimestamp ? getTimeAgo(user.locationTimestamp) : '--';

    // Fly to user’s location on the map
    flyToUser(user);

    // Fetch reverse geocoded address if location is available
    if (user.location && user.location.latitude && user.location.longitude) {
        fetchReverseGeocode(user.location.latitude, user.location.longitude)
            .then(address => {
                selectedUserAddressEl.textContent = address;
            })
            .catch(error => {
                console.error("Reverse geocode error:", error);
                selectedUserAddressEl.textContent = "Address not found";
            });
    } else {
        selectedUserAddressEl.textContent = "No location available";
    }

    // Open (slide in) the sidebar
    userInfoSidebar.classList.add('open');
}

// Closes the user info sidebar
function closeUserInfoSidebar() {
    userInfoSidebar.classList.remove('open');
    selectedUser = null;
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

// Update time since update periodically for the selected user
setInterval(() => {
    if (selectedUser && selectedUser.locationTimestamp) {
        selectedUserTimeAgoEl.textContent = getTimeAgo(selectedUser.locationTimestamp);
    }
}, 10000);

// Attach event listener to the close button of the user info sidebar
if (closeUserInfoSidebarBtn) {
    closeUserInfoSidebarBtn.addEventListener('click', closeUserInfoSidebar);
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
                updateMarkers();
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

// Note: The old initMap function is now replaced by our updated version above.
