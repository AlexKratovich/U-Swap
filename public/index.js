/**
 * Name: Alex K & Saleh K.
 * Date: Thursday, December 11, 2025
 * Section: CSE 154
 *
 * Description: Client-side logic for the U-SWAP experience including login,
 * profile rendering, search, cart management, and messaging helpers.
 */
"use strict";

(function() {
  const ACTION_ENROLL = "enroll";
  const ACTION_HISTORY = "history";
  const ACTION_WANT = "want";
  const ACTION_TRADE = "trade";

  let cart = {
    enroll: [],
    history: [],
    want: [],
    trade: []
  };
  let cartConfirmed = false;
  let currentClass = null;
  window.addEventListener("load", init);

  /**
   * Initializes the authentication view by wiring form submissions,
   * toggles, and persisted username defaults.
   */
  function init() {
    id("login").addEventListener("submit", (evt) => {
      evt.preventDefault();
      login();
    });
    id("signup").addEventListener("submit", (evt) => {
      evt.preventDefault();
      signup();
    });
    id("login-toggle").addEventListener("click", toggle);
    id("signup-toggle").addEventListener("click", toggle);
    if (localStorage.getItem("userName")) {
      id("username").value = localStorage.getItem("userName");
    }
  }

  /**
   * Handles login requests, stores session information, and prepares
   * the application views after authentication.
   */
  async function login() {
    try {
      let user = id("username").value;
      let pass = id("password").value;
      let loginInfo = new FormData();
      loginInfo.append("username", user);
      loginInfo.append("password", pass);
      let response = await fetch("/auth/login", {
        method: "POST",
        body: loginInfo
      });
      await statusCheck(response);
      let data = await response.json();
      id("username").value = "";
      id("password").value = "";
      localStorage.setItem("userId", data.id);
      if (id("stay-logged-in").checked) {
        localStorage.setItem("userName", data.username);
      }
      sessionStorage.setItem("userName", data.username);
      sessionStorage.setItem("userId", data.id);
      await populateWebsite();
      id("login-or-signup").classList.add("hidden");
    } catch (err) {
      makeErrorBox(err.message);
    }
  }

  /**
   * Builds all interactive modules once a user has successfully logged in.
   */
  async function populateWebsite() {
    try {
      initNavbar();
      await populateProfile();
      populateSearchView();
      populateCart();
      await fetchCart();
      showView("profile");
    } catch (err) {
      makeErrorBox(err.message);
    }
  }

  /**
   * Wire cart controls and render the initial summaries for each list.
   */
  function populateCart() {
    if (id("cart-confirm-btn")) {
      id("cart-confirm-btn").addEventListener("click", confirmCartSelection);
    }
    if (id("cart-submit-btn")) {
      id("cart-submit-btn").addEventListener("click", submitCartSelection);
    }
    renderCartLists();
  }

  /**
   * Sets up search-based event listeners on the discovery view.
   */
  function populateSearchView() {
    id("search-btn").addEventListener("click", submitSearch);
    id("search-results").replaceChildren("");
    id("add-to-cart-button").addEventListener("click", makeTransaction);
    id("go-back-button").addEventListener("click", goBack);
  }

  /**
   * Resets the detailed search result view back to the filter view.
   */
  function goBack() {
    id("search-controls").classList.remove("hidden");
    id("search-results").classList.remove("hidden");
    id("selected-class-view").classList.add("hidden");
    currentClass = null;
  }

  /**
   * Adds the selected class to the pending cart with the requested actions.
   */
  async function makeTransaction() {
    if (!currentClass) {
      makeErrorBox("Select a class first.");
    } else {
      let actions = getActions();
      if (!actions.length) {
        makeErrorBox("Choose an option.");
      } else {
        try {
          for (let i = 0; i < actions.length; i++) {
            let info = new FormData();
            info.append("course_id", currentClass.id);
            info.append("action", actions[i]);
            info.append("userId", sessionStorage.getItem("userId"));
            let response = await fetch("/cart/add", {
              method: "POST",
              body: info
            });
            await statusCheck(response);
          }
          await fetchCart();
          cartConfirmed = false;
          clearCartForm();
          showCartStatus("Added to cart.");
          makeSuccessBox("Added to cart.");
        } catch (err) {
          makeErrorBox(err.message);
        }
      }
    }
  }

  function getActions() {
    let actions = [];
    if (id("opt-current").checked) {
      actions.push(ACTION_ENROLL);
    }
    if (id("opt-taken").checked) {
      actions.push(ACTION_HISTORY);
    }
    if (id("opt-swap").checked) {
      actions.push(ACTION_TRADE);
    }
    if (id("opt-wanted").checked) {
      actions.push(ACTION_WANT);
    }
    return actions;
  }

  /**
   * Executes a search request based on the filter inputs and
   * renders the resulting class cards.
   */
  async function submitSearch() {
    try {
      id("search-results").replaceChildren("");
      id("search-results").classList.remove("hidden");
      let query = id("search-input").value.trim();
      let courseLevel = id("filter-level").value;
      let prereqFilter = id("filter-prereq").value;
      let sortFilter = id("filter-sort").value;
      let response = await fetch(`/classes?search=${query}
        &level=${courseLevel}
        &prereq=${prereqFilter}
        &sort=${sortFilter}`);
      await statusCheck(response);
      let classes = await response.json();
      let foundClasses = classes.classes;
      for (let cls of foundClasses) {
        let classCard = makeSmallClassCard(cls);
        id("search-results").appendChild(classCard);
      }
      id("search-input").value = "";
    } catch (err) {
      makeErrorBox("Unable to load classes. Please try again.");
    }
  }

  /**
   * Creates a summarized class card element for the search results list.
   * @param {Object} cls - Course metadata to display.
   * @return {HTMLElement} The rendered card node.
   */
  function makeSmallClassCard(cls) {
    let card = document.createElement("div");
    card.classList.add("small-info-card");
    card.id = cls.id;
    let cardP = document.createElement("p");
    cardP.textContent = "Course Code: " + cls.course_id + " Title: " + cls.title;
    card.appendChild(cardP);
    card.addEventListener("click", displayCard);
    return card;
  }

  /**
   * Fetches the selected class's full details and reveals the detail view.
   */
  async function displayCard() {
    try {
      let classId = this.id;
      let response = await fetch("/classes/" + classId);
      await statusCheck(response);
      let classInfo = await response.json();
      currentClass = classInfo;
      id("search-results").classList.add("hidden");
      id("search-controls").classList.add("hidden");
      id("selected-class-view").classList.remove("hidden");
      id("class-info-box").replaceChildren("");
      populateClass(classInfo);
    } catch (err) {
      makeErrorBox("Unable to load class details.");
    }
  }

  /**
   * Adds descriptive paragraphs for a course in the detail card view.
   * @param {Object} classInfo - Detailed class information from the server.
   */
  function populateClass(classInfo) {
    let titleP = makePtagWithStrongTag("Course: ", classInfo.course_id + " - " + classInfo.title);
    let creditsP = makePtagWithStrongTag("Credits: ", classInfo.credits);
    let descriptionP = makePtagWithStrongTag("Description: ", classInfo.description);
    let departmentP = makePtagWithStrongTag("Department: ", classInfo.department);
    let prereqP = makePtagWithStrongTag("Prerequisites: ", classInfo.prerequisites);
    let capacityP = makePtagWithStrongTag(
      "Capacity: ", classInfo.enrolled_count + "/" + classInfo.capacity
    );
    let requiredMajorP = makePtagWithStrongTag("Required Major: ", classInfo.required_major);
    let disclaimerP = makePtagWithStrongTag(
      "Disclaimer: ",
      `You need to have met all prerequisites, be in the major,
      and the class must have available slots in order to enroll.`
    );
    let view = id("class-info-box");
    view.appendChild(titleP);
    view.appendChild(creditsP);
    view.appendChild(descriptionP);
    view.appendChild(departmentP);
    view.appendChild(prereqP);
    view.appendChild(capacityP);
    view.appendChild(requiredMajorP);
    view.appendChild(disclaimerP);
  }

  /**
   * Loads the profile view data and initializes draggable layout controls.
   */
  async function populateProfile() {
    try {
      id("change-view-mode").addEventListener("click", changeLayout);
      qs("#profile-view h2").textContent = "Hello, " + sessionStorage.getItem("userName");
      showView("profile");
      clearProfileCards();
      await updateProfile();
      initProfileLayout();
    } catch (err) {
      makeErrorBox(err.message);
    }
  }

  /**
   * Refreshes each section of the profile view with the latest data.
   */
  async function updateProfile() {
    await populateEnrolledClasses();
    await populateWantedClasses();
    await populateGivingAwayClasses();
    await populatePastClasses();
    await populateUserSwaps();
    await populateUserTransactions();
  }

  /**
   * Retrieves all active enrollments for the profile view.
   */
  async function populateEnrolledClasses() {
    let response = await fetch("/profile/getEnrolledClasses" +
      "/" + sessionStorage.getItem("userId"));
    await statusCheck(response);
    let profileData = await response.json();

    let classes = profileData.enrolledClasses;
    let container = id("profile-enrolled");

    for (let cls of classes) {
      let card = createEnrolledClassCard(cls);
      container.appendChild(card);
    }
  }

  /**
   * Constructs a card showing extended course details for profile lists.
   * @param {Object} cls - Course data used for the card.
   * @return {HTMLElement} The built card element.
   */
  function createEnrolledClassCard(cls) {
    let card = document.createElement("div");
    card.classList.add("full-class-card");
    let topRow = document.createElement("div");
    topRow.classList.add("full-row");
    let code = document.createElement("span");
    code.classList.add("full-course-id");
    code.textContent = cls.course_code;
    let title = document.createElement("span");
    title.classList.add("full-course-title");
    title.textContent = cls.title;
    let credits = document.createElement("span");
    credits.classList.add("full-course-credits");
    credits.textContent = cls.credits + " credits";
    topRow.appendChild(code);
    topRow.appendChild(title);
    topRow.appendChild(credits);
    card.appendChild(topRow);
    let desc = document.createElement("p");
    desc.textContent = cls.description;
    card.appendChild(desc);
    let prereqs = makePtagWithStrongTag("Prerequisites: ", cls.prerequisites);
    card.appendChild(prereqs);
    let capacity = makePtagWithStrongTag("Capacity: ", `${cls.enrolled_count}/${cls.capacity}`);
    card.appendChild(capacity);
    card.id = cls.course_id + "-" + cls.status;
    card.addEventListener("dblclick", removeClass);
    return card;
  }

  /**
   * Removes a class from the profile when a card is double-clicked.
   */
  async function removeClass() {
    try {
      let courseId = this.id.split("-")[0];
      let status = this.id.split("-")[1];
      let classInfo = new FormData();
      classInfo.append("course_id", courseId);
      classInfo.append("status", status);
      classInfo.append("userId", sessionStorage.getItem("userId"));
      let response = await fetch("/remove-class", {
        method: "POST",
        body: classInfo
      });
      await statusCheck(response);
      let message = await response.text();
      makeSuccessBox(message);
      await populateProfile();
      this.remove();
    } catch (err) {
      makeErrorBox(err.message);
    }
  }

  /**
   * Loads swap history for the authenticated user.
   */
  async function populateUserSwaps() {
    let response = await fetch("/profile/getUserSwaps" +
      "/" + sessionStorage.getItem("userId"));
    await statusCheck(response);
    let profileData = await response.json();
    let userSwaps = profileData.userSwaps;
    for (let swap of userSwaps) {
      let swapCard = createSwapCard(swap);
      id("profile-all-swaps").appendChild(swapCard);
    }
  }

  /**
   * Builds a swap summary card describing both partners.
   * @param {Object} swap - Swap details from the server.
   * @return {HTMLElement} Swap card element.
   */
  function createSwapCard(swap) {
    let card = document.createElement("div");
    card.classList.add("full-class-card");
    let topRow = document.createElement("div");
    topRow.classList.add("full-row");
    let titleSpan = document.createElement("span");
    titleSpan.classList.add("full-course-id");
    titleSpan.textContent = swap.user1_course + " ↔ " + swap.user2_course;
    topRow.appendChild(titleSpan);
    card.append(topRow);
    let user1Username = makePtagWithStrongTag("User 1: ", swap.user1_username);
    card.appendChild(user1Username);
    let user1Class = makePtagWithStrongTag("User 1 Class : ", swap.user1_course);
    card.appendChild(user1Class);
    let user2Username = makePtagWithStrongTag("User 2: ", swap.user2_username);
    card.appendChild(user2Username);
    let user2Class = makePtagWithStrongTag("User 2 Class : ", swap.user2_course);
    card.appendChild(user2Class);
    let date = makePtagWithStrongTag("Created at : ", swap.created_at);
    card.appendChild(date);
    return card;
  }

  /**
   * Generates a <p> tag with a bolded label and supporting text.
   * @param {string} strongText - Text to bold at the start of the paragraph.
   * @param {string} pText - Supporting plain text.
   * @return {HTMLElement} Paragraph element containing the text.
   */
  function makePtagWithStrongTag(strongText, pText) {
    let pElement = document.createElement("p");
    let strongElement = document.createElement("strong");
    strongElement.textContent = strongText;
    pElement.appendChild(strongElement);
    pElement.appendChild(document.createTextNode(pText));
    return pElement;
  }

  /**
   * Fetches the transaction history and renders each entry.
   */
  async function populateUserTransactions() {
    let response = await fetch("/profile/transactions" +
      "/" + sessionStorage.getItem("userId"));
    await statusCheck(response);
    let profileData = await response.json();
    let transactions = profileData.transactions;
    let container = id("transaction-history");

    for (let transaction of transactions) {
      let card = createTransactionCard(transaction);
      container.appendChild(card);
    }
  }

  /**
   * Creates a transaction card summarizing history entries.
   * @param {Object} transaction - Transaction record information.
   * @return {HTMLElement} DOM node for the card.
   */
  function createTransactionCard(transaction) {
    let card = document.createElement("div");
    card.classList.add("full-class-card");
    let topRow = document.createElement("div");
    topRow.classList.add("full-row");
    let couseId = document.createElement("span");
    couseId.classList.add("full-course-id");
    couseId.textContent = transaction.course_code;
    topRow.appendChild(couseId);
    let transactionTitle = document.createElement("span");
    transactionTitle.textContent = statusToContainer(transaction.status);
    transactionTitle.classList.add("full-course-title");
    topRow.appendChild(transactionTitle);
    let transactionConfirmationStatus = document.createElement("span");
    transactionConfirmationStatus.classList.add("full-course-credits");
    transactionConfirmationStatus.textContent = transaction.confirmation_status;
    topRow.appendChild(transactionConfirmationStatus);
    card.append(topRow);
    let courseTitle = makePtagWithStrongTag("Course Title: ", transaction.course_code);
    card.appendChild(courseTitle);
    let confirmationCode = makePtagWithStrongTag(
      "Confirmation Code: ", transaction.confirmation_code
    );
    card.appendChild(confirmationCode);
    let date = makePtagWithStrongTag("Created at : ", transaction.date);
    card.appendChild(date);
    return card;
  }

  /**
   * Maps a status code to a user-facing label for transaction lists.
   * @param {string} status - Stored status code.
   * @return {string} The human-friendly label.
   */
  function statusToContainer(status) {
    let statusMap = {
      enrolled: "Enrolled Classes",
      wanted: "Wanted Classes",
      offering: "Classes Willing to Swap",
      history: "Class History"
    };
    if (status.includes('-')) {
      let mainStatus = status.split('-')[0];
      let modifier = status.split('-')[1];
      let mainLabel = statusMap[mainStatus];

      if (modifier === "dropped") {
        return `Dropped from: ${mainLabel}`;
      }
    }
    return `Updated: ${statusMap[status]}`;
  }

  /**
   * Loads all classes the user identified as wanted.
   */
  async function populateWantedClasses() {
    let response = await fetch("/profile/getWantedClasses" +
      "/" + sessionStorage.getItem("userId"));
    await statusCheck(response);
    let profileData = await response.json();
    let classes = profileData.wantedClasses;
    let container = id("profile-wanted");

    for (let cls of classes) {
      let card = createEnrolledClassCard(cls);
      container.appendChild(card);
    }
  }

  /**
   * Loads classes the user is willing to offer in a swap.
   */
  async function populateGivingAwayClasses() {
    let response = await fetch("/profile/getGivingAwayClasses" + "/"
      + sessionStorage.getItem("userId"));
    await statusCheck(response);
    let profileData = await response.json();
    let classes = profileData.givingAwayClasses;
    let container = id("profile-offering");

    for (let cls of classes) {
      let card = createEnrolledClassCard(cls);
      container.appendChild(card);
    }
  }

  /**
   * Loads completed courses for the user's academic history.
   */
  async function populatePastClasses() {
    let response = await fetch("/profile/getPastClasses" + "/"
      + sessionStorage.getItem("userId"));
    await statusCheck(response);
    let profileData = await response.json();
    let classes = profileData.pastClasses;
    let container = id("profile-class-history");

    for (let cls of classes) {
      let card = createEnrolledClassCard(cls);
      container.appendChild(card);
    }
  }

  /**
   * Toggles the profile layout between stacked and draggable modes.
   */
  function changeLayout() {
    // Adjust Container size
    let cardContainers = qsa("#profile-view .card-container");
    for (let cardContainer of cardContainers) {
      cardContainer.classList.toggle("draggable");
      cardContainer.classList.toggle("card-container-expanded");
      cardContainer.classList.toggle("card-container-fixed");
    }
    id("profile-view").classList.toggle("expanded");
    id("profile-view").classList.toggle("shrunk");
  }

  /**
   * Removes all current card DOM nodes from the profile view.
   */
  function clearProfileCards() {
    let cards = qsa("#profile-view > .card-container div");
    for (let card of cards) {
      card.remove();
    }
  }

  /**
   * Submits signup information and flips back to the login view on success.
   */
  async function signup() {
    try {
      let user = id("signup-username").value;
      let email = id("signup-email").value;
      let pass = id("signup-password").value;
      let signupInfo = new FormData();
      signupInfo.append("username", user);
      signupInfo.append("email", email);
      signupInfo.append("password", pass);
      let response = await fetch("/auth/register", {
        method: "POST",
        body: signupInfo
      });
      await statusCheck(response);
      let text = await response.text();
      makeSuccessBox(text);
      toggle();
    } catch (err) {
      makeErrorBox("Failed signing up: " + err.message);
    }
  }

  /**
   * Switches between the login and signup form visibility.
   */
  function toggle() {
    let forms = qsa("#login-or-signup > form");
    for (let i = 0; i < forms.length; i++) {
      forms[i].classList.toggle("hidden");
    }
    id("login-toggle").classList.toggle("hidden");
    id("signup-toggle").classList.toggle("hidden");
  }

  /**
   * Sets up the navbar greeting and view navigation actions.
   */
  function initNavbar() {
    qs("#nav-left p").textContent = "Hello, " + sessionStorage.getItem("userName") + "!";
    qs("header nav").classList.remove("hidden");
    id("icon-search").addEventListener("click", () => showView("search"));
    id("icon-cart").addEventListener("click", () => showView("cart"));
    id("icon-messages").addEventListener("click", () => showView("messages"));
    id("icon-profile").addEventListener("click", () => showView("profile"));
  }

  /**
   * Shows the requested application section and hides the rest.
   * @param {string} viewName - The view identifier to display.
   */
  function showView(viewName) {
    hideAllViews();
    if (viewName === "search") {
      id("search-view").classList.remove("hidden");
    }
    if (viewName === "cart") {
      id("cart-view").classList.remove("hidden");
    }
    if (viewName === "messages") {
      id("message-view").classList.remove("hidden");
    }
    if (viewName === "profile") {
      id("profile-view").classList.remove("hidden");
    }
  }

  /**
   * Adds the hidden class to every supported view container.
   */
  function hideAllViews() {
    let views = [
      "search-view",
      "cart-view",
      "message-view",
      "profile-view"
    ];

    for (let view of views) {
      id(view).classList.add("hidden");
    }
  }

  /**
   * Delegates rendering to each cart category list.
   */
  function renderCartLists() {
    renderCartList("cart-enroll-list", cart.enroll, ACTION_ENROLL);
    renderCartList("cart-history-list", cart.history, ACTION_HISTORY);
    renderCartList("cart-want-list", cart.want, ACTION_WANT);
    renderCartList("cart-giving-list", cart.trade, ACTION_TRADE);
  }

  /**
   * Renders a specific cart section list.
   * @param {string} listId - DOM id of the list container.
   * @param {Object[]} data - Courses queued for that action.
   * @param {string} actionType - Cart action identifier.
   */
  function renderCartList(listId, data, actionType) {
    let container = id(listId);
    if (container) {
      container.textContent = "";
      if (!data || data.length === 0) {
        let li = document.createElement("li");
        li.textContent = "No classes selected.";
        container.appendChild(li);
      } else {
        for (let i = 0; i < data.length; i++) {
          let entry = data[i];
          let li = document.createElement("li");
          let text = document.createElement("span");
          text.textContent = (
            entry.course_id || ("Course " + entry.id)) + " - " + (entry.title || ""
          );
          li.appendChild(text);
          let removeBtn = document.createElement("button");
          removeBtn.textContent = "Remove";
          removeBtn.classList.add("cart-remove-btn");
          removeBtn.addEventListener("click", () => removeCartItem(entry.id, actionType));
          li.appendChild(removeBtn);
          container.appendChild(li);
        }
      }
    }
  }

  /**
   * Confirms that the current cart selection is ready to submit.
   */
  async function confirmCartSelection() {
    let hasPendingItems = cart.enroll.length ||
      cart.history.length || cart.trade.length || cart.want.length;
    if (!hasPendingItems) {
      makeErrorBox("Select a class first.");
    } else {
      try {
        let sendId = new FormData();
        sendId.append("userId", sessionStorage.getItem("userId"));
        let response = await fetch("/transaction/confirm", {
          method: "POST",
          body: sendId
        });
        await statusCheck(response);
        let result = await response.json();
        cartConfirmed = true;
        showCartStatus(result.message || "Ready to checkout.");
        makeSuccessBox(result.message || "Ready to checkout.");
      } catch (err) {
        cartConfirmed = false;
        populateCart();
        console.log(err);
        showCartStatus(err.message);
        makeErrorBox(err.message);
      }
    }
  }

  /**
   * Submits a confirmed cart selection to create transactions.
   */
  async function submitCartSelection() {
    if (cartConfirmed) {
      try {
        let sendId = new FormData();
        sendId.append("userId", sessionStorage.getItem("userId"));
        let response = await fetch("/transaction/submit", {
          method: "POST",
          body: sendId
        });
        await statusCheck(response);
        await response.json();
        cartConfirmed = false;
        await fetchCart();
        clearCartForm();
        showCartStatus("Checkout complete.");
        makeSuccessBox("Checkout complete.");
        await populateProfile();
      } catch (err) {
        showCartStatus(err.message);
        makeErrorBox(err.message);
      }
    } else {
      makeErrorBox("Confirm your selection first.");
    }
  }

  /**
   * Displays a message below the cart controls as user feedback.
   * @param {string} message - The text to show.
   */
  function showCartStatus(message) {
    if (id("cart-status")) {
      id("cart-status").textContent = message;
    }
  }

  /**
   * Clears the classification checkboxes after submissions.
   */
  function clearCartForm() {
    id("opt-current").checked = false;
    id("opt-taken").checked = false;
    id("opt-wanted").checked = false;
    id("opt-swap").checked = false;
  }

  /**
   * Retrieves the current cart state from the server and stores it locally.
   */
  async function fetchCart() {
    try {
      let response = await fetch("/cart" + "/"
        + sessionStorage.getItem("userId"));
      await statusCheck(response);
      let data = await response.json();
      cart.enroll = [];
      cart.history = [];
      cart.want = [];
      cart.trade = [];
      let items = data.items || [];
      for (let item of items) {
        let entry = {
          id: item.course_id,
          course_id: item.course_code || item.course_id,
          title: item.title
        };
        if (item.action === ACTION_ENROLL) {
        cart.enroll.push(entry);
        } else if (item.action === ACTION_HISTORY) {
          cart.history.push(entry);
        } else if (item.action === ACTION_WANT) {
          cart.want.push(entry);
        } else if (item.action === ACTION_TRADE) {
          cart.trade.push(entry);
        }
      }
      cartConfirmed = false;
      renderCartLists();
    } catch (err) {
      makeErrorBox("Unable to update cart.");
    }
  }

  /**
   * Removes an individual class from a pending cart action.
   * @param {string} courseId - Course identifier to remove.
   * @param {string} action - Cart action type.
   */
  async function removeCartItem(courseId, action) {
    try {
      let info = new FormData();
      info.append("course_id", courseId);
      info.append("action", action);
      info.append("userId", sessionStorage.getItem("userId"));
      let response = await fetch("/cart/remove", {
        method: "POST",
        body: info
      });
      await statusCheck(response);
      await fetchCart();
      showCartStatus("Removed from cart.");
    } catch (err) {
      makeErrorBox(err.message);
      console.log(err);
    }
  }

  /**
   * Enables dragging for a card inside the profile view.
   * https://www.youtube.com/watch?v=ilJ7_F79bGw
   * @param {HTMLElement} box - Card to make draggable.
   * @param {HTMLElement} parent - Container bounding box.
   */
  function makeDraggable(box, parent) {
    let offsetX = false;
    let offsetY = false
    let isDown = false;

    box.addEventListener("mousedown", (evt) => {
      isDown = true;
      offsetX = evt.clientX - box.offsetLeft;
      offsetY = evt.clientY - box.offsetTop;
      box.style.zIndex = 9999;
    });

    document.addEventListener("mousemove", (evt) => {
      if (isDown) {
        let parentRect = parent.getBoundingClientRect();
        let boxRect = box.getBoundingClientRect();

        // Compute new position
        let newLeft = evt.clientX - offsetX;
        let newTop  = evt.clientY - offsetY;

        // Bound left & top
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;

        // Bound right & bottom
        let maxLeft = parentRect.width - boxRect.width;
        let maxTop  = parentRect.height - boxRect.height;

        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;

        // Apply new position
        box.style.left = newLeft + "px";
        box.style.top = newTop + "px";
      }
    });

    document.addEventListener("mouseup", () => {
      isDown = false;
    });
  }

  /**
   * Initializes layout metadata for every profile card to support dragging.
   * https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
   */
  function initProfileLayout() {
    let parent = id("profile-view");
    let boxes = document.querySelectorAll("#profile-view .card-container");

    for (let i = boxes.length - 1; i >= 0; i--) {
      let box = boxes[i];
      let rect = box.getBoundingClientRect();
      let parentRect = box.parentElement.getBoundingClientRect();

      let naturalTop = rect.top - parentRect.top;
      let naturalLeft = rect.left - parentRect.left;

      box.classList.add("draggable");
      box.style.top = naturalTop + "px";
      box.style.left = naturalLeft + "px";
      makeDraggable(box, parent);
    }
  }

  /**
   * Displays a dismissible error overlay.
   * @param {string} message - Error text to show.
   */
  function makeErrorBox(message) {
    let box = document.createElement("div");
    box.classList.add("error-box");
    box.textContent = "⚠️⚠️⚠️" + message + " ⚠️⚠️⚠️";
    handleBox(box, 4000);
  }

  /**
   * Displays a dismissible success overlay.
   * @param {string} message - Success text to show.
   */
  function makeSuccessBox(message) {
    let box = document.createElement("div");
    box.classList.add("sucess-box");
    box.textContent = "✅✅✅" + message + " ✅✅✅";
    handleBox(box, 4000);
  }

  /**
   * Handles removing notifications after the cooldown or clicks.
   * @param {HTMLElement} box - Element to monitor.
   * @param {number} cooldown - Milliseconds before auto-dismiss.
   */
  function handleBox(box, cooldown) {
    box.addEventListener("click", () => {
      box.remove();
    });
    qs("body").append(box);
    setTimeout(() => {
      box.remove();
    }, cooldown);
  }

  /**
   * Shorthand for document.getElementById.
   * @param {string} idName - Element id attribute.
   * @return {HTMLElement} Matching element.
   */
  function id(idName) {
    return document.getElementById(idName);
  }

  /**
   * Shorthand for document.querySelectorAll.
   * @param {string} sel - Selector to query.
   * @return {NodeList} Matching elements.
   */
  function qsa(sel) {
    return document.querySelectorAll(sel);
  }

  /**
   * Shorthand for document.querySelector.
   * @param {string} sel - Selector to query.
   * @return {HTMLElement} First matching node.
   */
  function qs(sel) {
    return document.querySelector(sel);
  }

  /**
   * Checks the response from a fetch call and throws an error if the response is not OK.
   * @param {Response} response - The fetch response object to check.
   * @return {Response} The same response if it passes the status check.
   * @throws {Error} If the response status is not OK.
   */
  async function statusCheck(response) {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response;
  }
})();
