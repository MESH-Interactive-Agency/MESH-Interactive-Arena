using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class SwitchWeapon : MonoBehaviour
{


    public GameObject head;
    public bool rightController;
    public bool leftController;
    private float _switchingRate = 1f;
    private float _nextSwitch = 1.0f;



    // Update is called once per frame
    void Update()
    {
        CheckIfSwitch();
    }

    private void CheckIfSwitch()
    {

    Vector3 controllerPos;


    if (rightController == true)
    {
        controllerPos = OVRInput.GetLocalControllerPosition(OVRInput.Controller.RTouch);
    }
    else
    {
        controllerPos = OVRInput.GetLocalControllerPosition(OVRInput.Controller.LTouch);
    }

    if (Vector3.Angle(transform.up, Vector3.up) > 80 && controllerPos.y > head.transform.position.y - 0.4f &&
        controllerPos.x < head.transform.position.x && Time.time > _nextSwitch)
    {
        _nextSwitch = Time.time + _switchingRate;
        var rayGun = this.gameObject.transform.GetChild(0);
        var shield = this.gameObject.transform.GetChild(1);
        if (rayGun.gameObject.activeSelf == true)
        {
            rayGun.gameObject.SetActive(false);
            shield.gameObject.SetActive(true);
        } else if (rayGun.gameObject.activeSelf == false)
        {
            rayGun.gameObject.SetActive(true);
            shield.gameObject.SetActive(false);
        }
    }
    }
}
