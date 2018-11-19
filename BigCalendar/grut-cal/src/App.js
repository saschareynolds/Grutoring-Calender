import React, { Component } from 'react';
import BigCalendar from 'react-big-calendar';
import moment from 'moment';
import 'moment-recur';
import { Row } from 'simple-flexbox';

import firebase,  { auth } from "./firebase.js";

import Navbar from './navbar.js';
import ClassPopUp from './AddClassPopUp';

import ScrapedCourses from "./courses.js";

import './css/App.css'
import './css/class-panel.css';
import './css/react-big-calendar.css';

const localizer = BigCalendar.momentLocalizer(moment)
const classesRef = firebase.database().ref("Classes");
const usersRef = firebase.database().ref("Users");

// Initialize start dates and end dates for grutor/grutee events
// const start_date = new Date(moment('2018-09-01', 'YYYY-MM-DD'));
// const end_date = new Date(moment('2018-09-20', 'YYYY-MM-DD'));
const START_DATE_FALL = "09/01/2018";
const END_DATE_FALL = "12/20/2018";
const NUM_RECCURING_EVENTS = 16;

class App extends Component {
	constructor(props) {
		super(props);
		this.state = {
		    current_user: null,
		    classes: [], // info about classes user is in
			classInfo: [], // info about grutoring sessions for classes user is IN
			grutorClasses: [], // info about classes that user GRUTORS
		    showPopup: false,
		    scrapedCourses: [],
			usersSnapshot: null,
			courses: [],
			calendarGruteeEvents: [], // events display format of grutee events
			calendarGrutorEvents: [] // events display format of grutor events
		};
		// logic for using offline json document for course listings
		var HMcourses = ScrapedCourses["courses"];
		var seenCourses = new Set()
		for(let course in HMcourses){
		    var curr_course = HMcourses[course];
			var courseCodeRaw = HMcourses[course]["course_code"];
			var courseCode = courseCodeRaw.substr(0, courseCodeRaw.lastIndexOf(" "))
			if(!seenCourses.has(courseCode)){
				this.state.scrapedCourses.push(curr_course);
				seenCourses.add(courseCode);
			}
		}
		// capture users Table
		usersRef.on("value", (snapshot) => {
			this.setState({
				usersSnapshot: snapshot
			})
		})

		this.togglePopup = this.togglePopup.bind(this);
		this.addCourse = this.addCourse.bind(this);
		this.logout = this.logout.bind(this);
		this.setCourses = this.setCourses.bind(this);
		this.removeCourse = this.removeCourse.bind(this);
		this.getGrutoringInfo = this.getGrutoringInfo.bind(this);
		this.mapEvents = this.mapEvents.bind(this);
		this.getChecked = this.getChecked.bind(this);
	}

	mapEvents(classType){
		var gruteeClasses = classType.map((enrolledClass) => {
			return(
				<div key={enrolledClass.value}>
					<label>{enrolledClass.value}<input type="checkbox" value={enrolledClass.value}
					checked ={enrolledClass.isChecked}
					onChange = {(classType === this.state.classes) ? this.toggleGruteeClass.bind(this) : this.toggleGrutorClass.bind(this)}/> <br></br></label>
					<button key={enrolledClass.value+"_button"} value={enrolledClass.value}
					onClick={(classType === this.state.classes) ? () => this.removeCourse(enrolledClass.value,false) : () => this.removeCourse(enrolledClass.value,true)}>Remove class</button>
				</div>
			)
		})
		return gruteeClasses;
	};


	toggleGrutorClass(event) {
		const title = event.target.value;
		for(let entry in this.state.grutorClasses){
			if (this.state.grutorClasses[entry].value === title){
				this.state.grutorClasses[entry].isChecked = !(this.state.grutorClasses[entry].isChecked);
			}
		}
		this.setState({calendarGrutorEvents: this.state.calendarGrutorEvents})
	}

	toggleGruteeClass(event) {
		const title = event.target.value;
		for(let entry in this.state.classes){
			if (this.state.classes[entry].value === title){
				this.state.classes[entry].isChecked = !(this.state.classes[entry].isChecked);
			}
		}
		this.setState({calendarGruteeEvents: this.state.calendarGruteeEvents})
	}

	eventList(calendarGrutorEvents){
		var newEvents = calendarGrutorEvents.filter(attr => {
			return this.getCheckedGrutor(attr.title) === true;
		});
		return newEvents
	}

	getChecked(className){
		for(let entry in this.state.classes){
			if(this.state.classes[entry].value === className){
				return this.state.classes[entry].isChecked;
			}
		}
		return false;
	}

	getCheckedGrutor(className){
		for(let entry in this.state.grutorClasses){
			if(this.state.grutorClasses[entry].value === className){
				return this.state.grutorClasses[entry].isChecked
			}
		}
		return false;
	}

	eventListGrutee(calendarGruteeEvents){
		var newEvents = calendarGruteeEvents.filter(attr => {
			return this.getChecked(attr.title) === true;
		});
		return newEvents;
	}

	constructFirebaseEntry(json, grutor){
		// function to construct Firebase course entry
		var name = json["course"].substr(0, json["course"].indexOf(" "));
		var course = {};
		if(grutor){
			// grutor logic
			course[name] = {
					location: json["location"],
					startTime: json["startTime"],
					endTime: json["endTime"],
					day: json["day"]
			}
		} else {
			// add to classes child in Firebase
			course[name] = true; //can be replaced with actual data if we want it
		}
		return course;
	}

	//add course to Users DB in Firebase
	addToUsers(name, course_entry, grutor, currentUser){
		usersRef.once("value").then(function(snapshot){
			if(grutor){
				var count = 1;
				var grutorClasses = usersRef.child(currentUser).child("grutorClasses");
				var code = Object.keys(course_entry)[0];
				var shiftName = code + "-" + count.toString();
				var indexed_entry = {[shiftName] : course_entry[code]}
				if(!(snapshot.hasChild(currentUser) && snapshot.child(currentUser).hasChild("grutorClasses"))){
					// no user or no grutoring classes for this user yet
					grutorClasses.set(indexed_entry);
				}else{
					// check to see if add to existing list of classes or this is a new shift for an existing grutoring class
					var existingShifts = snapshot.child(currentUser).child("grutorClasses").toJSON();
					for(let shift in existingShifts){
						var last_dash_index = shift.lastIndexOf("-")
						var index = shift.substr(last_dash_index+1);
						var shift_code = shift.substr(0, last_dash_index);
						if(shift_code === code && index === count.toString()){
							count++;
						}
					}
					shiftName = code + "-" + count.toString();
					grutorClasses.child(shiftName).set(course_entry[code]);
				}
			}else{
				var classes = usersRef.child(currentUser).child("classes");
				if(!(snapshot.hasChild(currentUser) && snapshot.child(currentUser).hasChild("classes"))){
					// no user or classes for this user yet
					classes.set(course_entry);
				}else{
					// update
					classes.child(name).set(course_entry[name]);
				}
			}
		})
	}

	// adds course/grutor to Classes DB in Firebase
	addToClasses(code, course_name, grutor, currentUser){
		classesRef.once("value").then(function(snapshot){
			if(!snapshot.hasChild(code)){
				var course = {[code]: course_name};
				classesRef.child(code).set(course);
			}
			// add new grutor if not already present
			if(grutor && !snapshot.child(code).child("grutors").child(currentUser).exists()){
				var grutors = classesRef.child(code).child("grutors");
				var data = {[currentUser]: true};
				grutors.child(currentUser).set(data[currentUser]);
			}
		})
	}

	// callback function for adding a course using overlay
  addCourse(course){
    var json = course;
    const currentUser = this.state.current_user.displayName;
		const grutor = json["role"] === "grutor";
		const course_name = json["course"].substr(json["course"].lastIndexOf("-")+1).trim()
		var course_entry = this.constructFirebaseEntry(json, grutor);
		var name = Object.keys(course_entry)[0];
		this.addToUsers(name, course_entry, grutor, currentUser);
		this.addToClasses(name, course_name, grutor, currentUser);
  }

	// function for setting up grutoring info for classes that User is IN
	getGrutoringInfo(classes){
		classesRef.on("value", (snapshot) => {
			var grutorInfo = [];
			var obj = {};
			if(this.state.usersSnapshot !== null){
				for(let i in classes){
					var classCode = classes[i]
					// get grutors for this class
					var grutors = snapshot.child(classCode).child("grutors");
					if(grutors.exists()){
						var grutorsJSON = grutors.toJSON();
						for(let grutorName in grutorsJSON){
							var grutorJSON = this.state.usersSnapshot.child(grutorName).child("grutorClasses").toJSON();
							for(let shift in grutorJSON){
								obj = {};
								if(shift.substr(0, shift.lastIndexOf('-')) === classCode){
									obj[classCode] = grutorJSON[shift];
									obj[classCode]["grutor"] = grutorName
									grutorInfo.push(obj);
								}
							}
						}
					}else{
						obj = {};
						obj[classCode] = "No grutors for this class";
						grutorInfo.push(obj);
					}
				}
			}else{
				grutorInfo = [];
			}
			// set state whenever snapshot changes
			this.parseGruteeEventsList(grutorInfo);
			this.setState({
				classInfo: grutorInfo
			},function(){
				console.log(this.state.classInfo)
			});
		})
	}

	// Helper function that parses grutorClasses obtained from Firebase into events
	// list to be displayed on calendar
	parseGrutorEventsList(grutorClasses) {
		// Initialize variable that events object uses
		var title = "";
		var start = "";
		var end = "";
		var isChecked = "";
		var location = "";
		var grutor = "";

		// Initiliaze variables that have to be stored for parsing
		var day = "";
		var startTime = "";
		var dateTimeStringStart = "";
		var endDate = "";
		var endTime = "";
		var dateTimeStringEnd = "";
		var tempEvents = [];

		// Iterate through every {} object in grutorInfo
		for(var i = 0; i < grutorClasses.length; i++) {
			// parse title from grutorClasses list
			title = Object.keys(grutorClasses[i])[0];

			//parse start time from grutorClasses list
			startTime = Object.values(Object.values(grutorClasses[i])[0])[3];

			grutor = this.state.current_user.displayName;

			//parse location info
			location = Object.values(Object.values(grutorClasses[i])[0])[2];

			//parse end time from grutorClasses list
			endTime = Object.values(Object.values(grutorClasses[i])[0])[1];

			//parse day of grutor event from grutorClasses list
			day = Object.values(Object.values(grutorClasses[i])[0])[0];

			// Generate list of recurring events based on the input day
			var recur = moment(START_DATE_FALL).recur(END_DATE_FALL).every(day).daysOfWeek();
			var listRecurringDates = recur.next(NUM_RECCURING_EVENTS);

			// Iterate to populate recurring events
			for (var j = 0; j < NUM_RECCURING_EVENTS; j++) {

				// extract the current event date (moment object)
				var currentEventDate = listRecurringDates[j];
				var currentDateString = currentEventDate.format('YYYY-MM-DD');
				var dateTimeStringStart = currentDateString + " " + startTime;
				var dateTimeStringEnd = currentDateString + " " + endTime;

				// Update the start and end fields of the event
				start = new Date(moment(dateTimeStringStart, 'YYYY-MM-DD HH:mm'));
				end = new Date(moment(dateTimeStringEnd, 'YYYY-MM-DD HH:mm'));

				isChecked = false;

				var obj = {
					title,
					start,
					end,
					isChecked,
					location,
					grutor
				}
				tempEvents.push(obj)
			}
		}
		// Now we update the current state to reflect changes in events displayed
		// on the calendar
		this.setState({
			calendarGrutorEvents: tempEvents
		});
	}

	parseGruteeEventsList(classInfo) {
		// Initialize variable that events object uses
		var title = "";
		var start = "";
		var end = "";
		var isChecked = "";
		var location = "";
		var grutor = "";

		// Initiliaze variables that have to be stored for parsing
		var day = "";
		var startTime = "";
		var dateTimeStringStart = "";
		var endDate = "";
		var endTime = "";
		var dateTimeStringEnd = "";
		var tempEventsList = [];

		// Iterate through every {} object in classInfo
		for(var i = 0; i < classInfo.length; i++) {

			// parse title from grutorClasses list
			title = Object.keys(classInfo[i])[0];

			//parse location info
			location = Object.values(Object.values(classInfo[i])[0])[2];

			grutor = Object.values(Object.values(classInfo[i])[0])[4];

			//parse start time from classInfo list
			startTime = Object.values(Object.values(classInfo[i])[0])[3];

			//parse end time from classInfo list
			endTime = Object.values(Object.values(classInfo[i])[0])[1];

			//parse day of grutee event from classInfo list
			day = Object.values(Object.values(classInfo[i])[0])[0];






			///check events that occur at the same time here - new for loop 







			// Generate list of recurring events based on the input day
			var recur = moment(START_DATE_FALL).recur(END_DATE_FALL).every(day).daysOfWeek();
			var listRecurringDates = recur.next(NUM_RECCURING_EVENTS);

			// Iterate to populate recurring events
			for (var j = 0; j < NUM_RECCURING_EVENTS; j++) {

				// extract the current event date (moment object)
				var currentEventDate = listRecurringDates[j];
				var currentDateString = currentEventDate.format('YYYY-MM-DD');
				var dateTimeStringStart = currentDateString + " " + startTime;
				var dateTimeStringEnd = currentDateString + " " + endTime;

				// Update the start and end fields of the event
				start = new Date(moment(dateTimeStringStart, 'YYYY-MM-DD HH:mm'));
				end = new Date(moment(dateTimeStringEnd, 'YYYY-MM-DD HH:mm'));

				isChecked = false;

				var obj = {
					title,
					start,
					end,
					isChecked,
					location,
					grutor,
				}
				tempEventsList.push(obj)
			}
		}

		// Now we update the current state to reflect changes in events displayed
		// on the calendar
		this.setState({
			calendarGruteeEvents: tempEventsList
		});
	}

	// function to get courses from Firebase
	setCourses(){
		if(this.state.current_user === null){
			// no user logged in
			this.setState({
				classes: [],
				grutorClasses: []
			}, function(){
				document.getElementById("firebase-classes").textContent = "No user logged in.";
				document.getElementById("firebase-grutorClasses").textContent = "No user logged in.";
			})
		}else{
			const currentUser = this.state.current_user.displayName;
			const userRef = firebase.database().ref("Users/"+currentUser);
			// get snapshot of user's entry in Firebase
			userRef.on('value', (snapshot) => {
				let enrolledClasses = [];
				let grutorClasses = [];
				if(snapshot.exists()){
					// get classes for this user
					if(snapshot.hasChild("classes")){
						snapshot.child("classes").forEach(function(child){
							enrolledClasses.push(child.key);
						});
						this.getGrutoringInfo(enrolledClasses);
					}
					// get classes this user is grutoring for
					if(snapshot.hasChild("grutorClasses")){
						let data = snapshot.child("grutorClasses").val();
						for(let grutorClass in data){
							let obj = {[grutorClass]: data[grutorClass]};
							grutorClasses.push(obj);
						}
					}
				}
				// Parse event title, startTime, and endTime for calendar display
				this.parseGrutorEventsList(grutorClasses);
				let withCheck = [];
				for(let event in enrolledClasses){
					let obj = {value: enrolledClasses[event], isChecked: false};
					withCheck.push(obj);
				};
				let withCheckGrutor = [];
				for(let event in grutorClasses){
					let obj = {value: Object.keys(grutorClasses[event])[0], isChecked: false};
					withCheckGrutor.push(obj);
				};
				this.setState({
					classes: withCheck,
					grutorClasses: withCheckGrutor
				})
			})
		}
	}

  	//logout function to be passed to navbar component
  	logout(){
    	auth.signOut().then(() => {
        	this.setState({
            	current_user: null
        	});
    	});
  	}

	displayData() {
		let userData = this.state.testState.map((item) => {
			return (
				<li key={item.id}>{item.classes[0]}</li>
			)});
		return userData;
	}

	componentDidMount(){
  	auth.onAuthStateChanged((user) => {
    	if(user){
				const usersRef = firebase.database().ref("Users");
				usersRef.once('value', (snapshot) => {
					let items = snapshot.val();
	    			let newState = [];
	    			for (let item in items) {
							newState.push({
								id: item,
								class: items[item].classes,
								grutorClassses: items[item].grutorClasses
							});
						}
          	this.setState({
              	current_user: user,
          	}, this.setCourses);
		  	})
			}
		})
	}

	// toggles the display of the add course overlay
	togglePopup(){
  	this.setState({
      	showPopup: !this.state.showPopup
  	});
	};

	// function for removing course from Firebase
	removeCourse(shiftCode,isGrutor){
		const currentUser = this.state.current_user.displayName;
		if (isGrutor){
			// remove the shift entry for this user under Users DB
			var userRef = firebase.database().ref(`/Users/${currentUser}/grutorClasses/${shiftCode}`);
			var targetCode = shiftCode.substr(0, shiftCode.lastIndexOf("-"));
			userRef.remove().then(function() {
				console.log("User-side Grutor remove succeeded.")
			})
			.catch(function(error) {
				console.log("User-side Grutor remove failed: " + error.message)
			});

			// check if there are other shifts for this class for this user before choosing to remove from class-side DB
			userRef = firebase.database().ref("Users/" + currentUser + "/grutorClasses");
			userRef.once("value").then(function(snapshot){
				var grutorClasses = snapshot.toJSON();
				var otherShift = false;
				for(let shift in grutorClasses){
					var code = shift.substr(0, shift.lastIndexOf("-"));
					if(code === targetCode && shift !== shiftCode){
						otherShift = true;
						break;
					}
				}
				if(!otherShift){
					// no other shifts, remove this user from grutor list in class DB
					console.log("No other shifts");
					const grutorRef = firebase.database().ref(`/Classes/${targetCode}/grutors/${currentUser}`);
					grutorRef.remove().then(function(){
						console.log("Class-side Grutor remove succeeded.")
					}).catch(function(error){
						console.log("Class-side Grutor remove failed: " + error.message);
					})
				}
			})
		}
		else{
			// remove class from Users Classes under Users DB
			const userRef = firebase.database().ref(`/Users/${currentUser}/classes/${shiftCode}`);
			console.log("Remove grutee succeeded.")
			userRef.remove();
		}
	}

	render() {
    return (
      <div className = "wholeThing">
        <Row>
          <Navbar
            logout={this.logout}
						current_user = {this.state.current_user}
					/>
        </Row>
				<div className = "body" >
          <div className = "classSidebar" >
						<h1>Class List</h1>
						<form>
						{this.state.current_user ?
							this.mapEvents(this.state.classes)
							:
							null
						}
						</form>
						<h1>Grutoring List</h1>
						<form>
						{this.state.current_user ?
							this.mapEvents(this.state.grutorClasses)
							:
							null
						}
						</form>
						{this.state.current_user ?
							<div>
								<button onClick={this.togglePopup}>Add a class</button>
							</div>
							:
							<div>
								<p>You need to login to add classes.</p>
							</div>
						}
					</div>
					<div className = "calendar">
						<BigCalendar
							selectable
							localizer={localizer}

							onSelectEvent={event => alert(

								"Class:  " +  event.title + "\n" +
								"Location: " + event.location + "\n" +
								"Time: " + event.start + "\n" +
								"Grutor: " + event.grutor
								
								)}


							events={this.state.current_user ?
								this.eventList(this.state.calendarGrutorEvents).concat(this.eventListGrutee(this.state.calendarGruteeEvents))
								:
								[]
							}
							defaultView={BigCalendar.Views.WEEK}
							defaultDate={new Date(moment())}
							min = {new Date(moment('2018-05-17-2018 9:00', 'YYYY-MM-DD HH:mm'))}
							// min={new Date(2018, 10, 0, 9, 0, 0)}
	 						// max={new Date(2018, 10, 0, 23, 0, 0)}
						/>
					</div>
				</div>
				<div name = "classPopUp">
          {this.state.showPopup ?
            <ClassPopUp
              courses = {this.state.scrapedCourses}
              closePopup = {this.togglePopup}
              addCourse = {(course) => {this.addCourse(course)}}/>
            :
            null
					}
				</div>
			</div>
  	);
	}
};

export default App
